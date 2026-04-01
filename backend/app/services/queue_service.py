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
        """Pick queued runs and dispatch them to the worker pool.

        Processes up to MAX_BATCH_SIZE runs per cycle to prevent starvation
        when many jobs trigger simultaneously (e.g. 10 jobs on same cron).
        """
        from app.services.worker_pool import get_worker_pool
        from app.services.venv_manager import get_venv_manager
        from app.services.execution_service import run_job

        pool = get_worker_pool()
        MAX_BATCH_SIZE = pool.max_workers  # No point fetching more than pool capacity

        # --- Phase 1: Fetch batch of queued runs ---
        pending_jobs: list[dict] = []

        db = SessionLocal()
        try:
            results = (
                db.query(JobRun, Job)
                .join(Job, JobRun.job_id == Job.id)
                .filter(
                    JobRun.status == "queued",
                    Job.is_active == True,
                )
                .order_by(Job.priority.asc(), JobRun.queued_at.asc())
                .limit(MAX_BATCH_SIZE)
                .all()
            )

            if not results:
                return

            for run, job in results:
                pending_jobs.append({
                    "run_id": run.id,
                    "job_id": job.id,
                    "code": job.code,
                    "timeout": job.timeout_seconds,
                    "env": job.env_dict,
                    "requirements": getattr(job, "requirements", None),
                    "max_concurrent": getattr(job, "max_concurrent", 1),
                })
        except Exception as e:
            logger.error(f"Queue read error: {e}")
            return
        finally:
            db.close()

        # --- Phase 2: Dispatch each to worker pool ---
        for pj in pending_jobs:
            try:
                # Capture loop vars safely to avoid closure bugs
                _run_id = pj["run_id"]
                _job_id = pj["job_id"]
                _code = pj["code"]
                _timeout = pj["timeout"]
                _env = pj["env"]
                _reqs = pj["requirements"]
                _max_c = pj["max_concurrent"]

                async def coro_factory(worker_id: str, run_id=_run_id, job_id=_job_id,
                                       code=_code, timeout=_timeout, env=_env,
                                       reqs=_reqs):
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
                    try:
                        python_path = await venv_mgr.ensure_venv(reqs)
                    except Exception as venv_err:
                        _db2 = SessionLocal()
                        try:
                            _run2 = _db2.query(JobRun).filter(JobRun.id == run_id).first()
                            if _run2:
                                _run2.status = "failed"
                                _run2.error_message = f"Venv setup failed: {venv_err}"
                                _run2.finished_at = datetime.now(timezone.utc)
                                _db2.commit()
                        finally:
                            _db2.close()
                        logger.error(f"Venv setup failed for job {job_id}: {venv_err}")
                        return

                    await run_job(job_id, run_id, code, timeout, env, python_path=python_path)

                started = await pool.execute(
                    job_id=_job_id,
                    run_id=_run_id,
                    max_concurrent=_max_c,
                    coro_factory=coro_factory,
                )

                if not started:
                    logger.debug(f"Run {_run_id} stays queued (pool/lock limit)")
                    break  # Pool full — no point trying remaining items

            except Exception as e:
                logger.error(f"Queue processing error for run {pj.get('run_id')}: {e}")

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
