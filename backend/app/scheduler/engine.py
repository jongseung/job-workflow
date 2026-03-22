import asyncio
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from app.config import settings
from app.database import SessionLocal

logger = logging.getLogger(__name__)

scheduler: AsyncIOScheduler | None = None


def get_scheduler() -> AsyncIOScheduler:
    global scheduler
    if scheduler is None:
        jobstores = {
            "default": SQLAlchemyJobStore(url=settings.DATABASE_URL)
        }
        scheduler = AsyncIOScheduler(jobstores=jobstores)
    return scheduler


def start_scheduler():
    s = get_scheduler()
    if not s.running:
        s.start()
        logger.info("Scheduler started")


def shutdown_scheduler():
    global scheduler
    if scheduler and scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Scheduler shut down")
    scheduler = None


async def execute_scheduled_job(job_id: str):
    """Called by APScheduler when a scheduled job triggers.

    Routes through Queue Service for Worker Pool management.
    """
    from app.models.job import Job
    from app.services.queue_service import get_queue_service

    db = SessionLocal()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job or not job.is_active:
            return

        queue = get_queue_service()
        queue.enqueue(db, job_id, trigger_type="scheduled")
    finally:
        db.close()


def register_job(job_id: str, schedule_type: str, cron_expression: str | None, interval_seconds: int | None):
    """Register a job with the scheduler."""
    s = get_scheduler()
    job_store_id = f"job_{job_id}"

    # Remove existing if any
    try:
        s.remove_job(job_store_id)
    except Exception:
        pass

    if schedule_type == "cron" and cron_expression:
        parts = cron_expression.strip().split()
        if len(parts) == 5:
            trigger = CronTrigger(
                minute=parts[0],
                hour=parts[1],
                day=parts[2],
                month=parts[3],
                day_of_week=parts[4],
            )
            s.add_job(
                execute_scheduled_job,
                trigger=trigger,
                id=job_store_id,
                args=[job_id],
                replace_existing=True,
            )
            logger.info(f"Registered cron job {job_id}: {cron_expression}")

    elif schedule_type == "interval" and interval_seconds:
        trigger = IntervalTrigger(seconds=interval_seconds)
        s.add_job(
            execute_scheduled_job,
            trigger=trigger,
            id=job_store_id,
            args=[job_id],
            replace_existing=True,
        )
        logger.info(f"Registered interval job {job_id}: every {interval_seconds}s")


def unregister_job(job_id: str):
    """Remove a job from the scheduler."""
    s = get_scheduler()
    try:
        s.remove_job(f"job_{job_id}")
        logger.info(f"Unregistered job {job_id}")
    except Exception:
        pass


def sync_jobs_from_db():
    """Load all active scheduled jobs from DB into APScheduler on startup."""
    from app.models.job import Job

    db = SessionLocal()
    try:
        jobs = db.query(Job).filter(
            Job.is_active == True,
            Job.schedule_type.in_(["cron", "interval"]),
        ).all()

        for job in jobs:
            register_job(job.id, job.schedule_type, job.cron_expression, job.interval_seconds)

        logger.info(f"Synced {len(jobs)} scheduled jobs from database")
    finally:
        db.close()


def get_scheduler_status() -> dict:
    """Get current scheduler status."""
    s = get_scheduler()
    jobs = s.get_jobs()
    return {
        "running": s.running,
        "job_count": len(jobs),
        "jobs": [
            {
                "id": j.id,
                "next_run_time": j.next_run_time.isoformat() if j.next_run_time else None,
                "trigger": str(j.trigger),
            }
            for j in jobs
        ],
    }
