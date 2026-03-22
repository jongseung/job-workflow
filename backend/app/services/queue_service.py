"""
Queue Service: DB-based priority queue using job_runs.status='queued'.

- All state in DB (survives restart)
- Queue processor runs every QUEUE_CHECK_INTERVAL seconds
- Picks runs: priority ASC, queued_at ASC (FIFO within same priority)
"""

import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.job import Job
from app.models.job_run import JobRun

logger = logging.getLogger(__name__)


class QueueService:
    def __init__(self):
        self._processor_task: asyncio.Task | None = None
        self._running = False

    def enqueue(self, db: Session, job_id: str, trigger_type: str = "scheduled",
                attempt_number: int = 1, triggered_by: str | None = None) -> JobRun:
        """Create a new queued run for a job."""
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            raise ValueError(f"Job {job_id} not found")

        run = JobRun(
            job_id=job_id,
            status="queued",
            trigger_type=trigger_type,
            attempt_number=attempt_number,
            triggered_by=triggered_by,
            queued_at=datetime.now(timezone.utc),
        )
        db.add(run)
        db.commit()
        db.refresh(run)
        logger.info(f"Enqueued run {run.id} for job {job.name} (priority={job.priority})")
        return run

    def get_queued_runs(self, db: Session, limit: int = 20) -> list[dict]:
        """Get current queue contents sorted by execution order."""
        runs = (
            db.query(JobRun, Job)
            .join(Job, JobRun.job_id == Job.id)
            .filter(JobRun.status == "queued")
            .order_by(Job.priority.asc(), JobRun.queued_at.asc())
            .limit(limit)
            .all()
        )
        result = []
        for i, (run, job) in enumerate(runs):
            result.append({
                "run_id": run.id,
                "job_id": job.id,
                "job_name": job.name,
                "priority": job.priority,
                "queued_at": run.queued_at.isoformat() if run.queued_at else None,
                "position": i + 1,
            })
        return result

    def get_queued_count(self, db: Session) -> int:
        return db.query(JobRun).filter(JobRun.status == "queued").count()

    async def process_queue(self):
        """Pick next queued run and attempt execution.

        IMPORTANT: Session is opened and closed as quickly as possible
        to avoid SQLite lock contention with other endpoints.
        """
        from app.services.worker_pool import get_worker_pool
        from app.services.venv_manager import get_venv_manager
        from app.services.execution_service import run_job

        pool = get_worker_pool()

        # --- Phase 1: Read data from DB with minimal lock time ---
        run_id = None
        job_id = None
        job_code = None
        job_timeout = None
        job_env = None
        job_requirements = None
        job_max_concurrent = 1

        db = SessionLocal()
        try:
            result = (
                db.query(JobRun, Job)
                .join(Job, JobRun.job_id == Job.id)
                .filter(
                    JobRun.status == "queued",
                    Job.is_active == True,
                )
                .order_by(Job.priority.asc(), JobRun.queued_at.asc())
                .first()
            )

            if not result:
                return

            run, job = result
            run_id = run.id
            job_id = job.id
            job_code = job.code
            job_timeout = job.timeout_seconds
            job_env = job.env_dict
            job_requirements = getattr(job, "requirements", None)
            job_max_concurrent = getattr(job, "max_concurrent", 1)
        except Exception as e:
            logger.error(f"Queue read error: {e}")
            return
        finally:
            db.close()

        # --- Phase 2: Execute (no DB session held) ---
        try:
            async def coro_factory(worker_id: str):
                _db = SessionLocal()
                try:
                    _run = _db.query(JobRun).filter(JobRun.id == run_id).first()
                    if _run:
                        _run.status = "running"
                        _run.worker_id = worker_id
                        _run.started_at = datetime.now(timezone.utc)
                        _db.commit()
                finally:
                    _db.close()

                # Resolve python path via venv manager
                venv_mgr = get_venv_manager()
                python_path = await venv_mgr.ensure_venv(job_requirements)

                await run_job(
                    job_id, run_id, job_code, job_timeout,
                    job_env, python_path=python_path,
                )

            started = await pool.execute(
                job_id=job_id,
                run_id=run_id,
                max_concurrent=job_max_concurrent,
                coro_factory=coro_factory,
            )

            if not started:
                logger.debug(f"Run {run_id} stays queued (pool/lock limit)")

        except Exception as e:
            logger.error(f"Queue processing error: {e}")

    async def start_processor(self, interval: int = 5):
        """Start the queue processor loop."""
        self._running = True
        logger.info(f"Queue processor started (interval={interval}s)")
        while self._running:
            try:
                await self.process_queue()
            except Exception as e:
                logger.error(f"Queue processor error: {e}")
            await asyncio.sleep(interval)

    def stop_processor(self):
        self._running = False
        if self._processor_task:
            self._processor_task.cancel()


# Singleton
_queue_service: QueueService | None = None


def get_queue_service() -> QueueService:
    global _queue_service
    if _queue_service is None:
        _queue_service = QueueService()
    return _queue_service
