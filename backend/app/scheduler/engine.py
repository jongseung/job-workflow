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


# ─── Workflow scheduling ───────────────────────────────────────────────────────

async def execute_scheduled_workflow(workflow_id: str):
    """Called by APScheduler when a scheduled workflow triggers."""
    from app.models.workflow import Workflow
    from app.services.workflow_service import create_run
    from app.services.workflow_execution_service import run_workflow

    db = SessionLocal()
    try:
        wf = db.query(Workflow).filter(Workflow.id == workflow_id).first()
        if not wf or not wf.is_active:
            logger.info(f"Skipping scheduled workflow {workflow_id}: inactive or not found")
            return
        if not wf.canvas_data or not wf.canvas_data.get("nodes"):
            logger.info(f"Skipping scheduled workflow {workflow_id}: no canvas nodes")
            return

        run = create_run(db, workflow_id, trigger_type="scheduled", context_data={})
        canvas = wf.canvas_data
        run_id = run.id
    finally:
        db.close()

    # Fire-and-forget in the same event loop
    asyncio.ensure_future(run_workflow(run_id, canvas, {}))
    logger.info(f"Scheduled workflow {workflow_id} fired → run {run_id}")


def register_workflow(
    workflow_id: str,
    schedule_type: str,
    cron_expression: str | None,
    interval_seconds: int | None,
):
    """Register a workflow with APScheduler."""
    s = get_scheduler()
    store_id = f"workflow_{workflow_id}"

    # Remove existing entry
    try:
        s.remove_job(store_id)
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
                execute_scheduled_workflow,
                trigger=trigger,
                id=store_id,
                args=[workflow_id],
                replace_existing=True,
            )
            logger.info(f"Registered cron workflow {workflow_id}: {cron_expression}")

    elif schedule_type == "interval" and interval_seconds:
        trigger = IntervalTrigger(seconds=interval_seconds)
        s.add_job(
            execute_scheduled_workflow,
            trigger=trigger,
            id=store_id,
            args=[workflow_id],
            replace_existing=True,
        )
        logger.info(f"Registered interval workflow {workflow_id}: every {interval_seconds}s")


def unregister_workflow(workflow_id: str):
    """Remove a workflow from APScheduler."""
    s = get_scheduler()
    try:
        s.remove_job(f"workflow_{workflow_id}")
        logger.info(f"Unregistered workflow {workflow_id}")
    except Exception:
        pass


def sync_workflows_from_db():
    """Load all active scheduled workflows from DB into APScheduler on startup."""
    from app.models.workflow import Workflow

    db = SessionLocal()
    try:
        workflows = db.query(Workflow).filter(
            Workflow.is_active == True,
            Workflow.schedule_type.in_(["cron", "interval"]),
        ).all()

        for wf in workflows:
            register_workflow(wf.id, wf.schedule_type, wf.cron_expression, wf.interval_seconds)

        logger.info(f"Synced {len(workflows)} scheduled workflows from database")
    finally:
        db.close()


def get_workflow_next_run(workflow_id: str) -> str | None:
    """Return ISO next_run_time for a scheduled workflow, or None."""
    s = get_scheduler()
    try:
        job = s.get_job(f"workflow_{workflow_id}")
        if job and job.next_run_time:
            return job.next_run_time.isoformat()
    except Exception:
        pass
    return None


# ─── Maintenance: auto-cleanup logs ──────────────────────────────────────────

async def execute_log_cleanup():
    """Scheduled task: delete old runs & logs (every 3 days)."""
    from app.services.maintenance_service import MaintenanceService
    maint = MaintenanceService()
    result = await maint.cleanup_history()
    logger.info(f"Scheduled log cleanup completed: {result}")


def register_log_cleanup():
    """Register a recurring log cleanup job that runs daily at 03:00."""
    s = get_scheduler()
    store_id = "system_log_cleanup"

    try:
        s.remove_job(store_id)
    except Exception:
        pass

    # Run daily at 03:00 — cleanup_history uses 3-day retention
    trigger = CronTrigger(hour=3, minute=0)
    s.add_job(
        execute_log_cleanup,
        trigger=trigger,
        id=store_id,
        replace_existing=True,
    )
    logger.info("Registered system log cleanup job (daily 03:00, retention=3 days)")


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
