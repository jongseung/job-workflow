import os
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, cast, Date, text

from app.database import get_db
from app.models.job import Job
from app.models.job_run import JobRun
from app.models.workflow import Workflow, WorkflowRun
from app.scheduler.engine import get_scheduler_status
from app.core.dependencies import get_current_user
from app.models.user import User
from app.config import settings

router = APIRouter(prefix="/api/system", tags=["system"])

_start_time = datetime.now(timezone.utc)


@router.get("/health")
def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": settings.VERSION,
    }


@router.get("/stats")
def get_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    total_jobs = db.query(func.count(Job.id)).scalar()
    active_jobs = db.query(func.count(Job.id)).filter(Job.is_active == True).scalar()

    total_runs = db.query(func.count(JobRun.id)).scalar()
    success_runs = db.query(func.count(JobRun.id)).filter(JobRun.status == "success").scalar()
    failed_runs = db.query(func.count(JobRun.id)).filter(JobRun.status == "failed").scalar()
    running_now = db.query(func.count(JobRun.id)).filter(JobRun.status == "running").scalar()

    success_rate = (success_runs / total_runs * 100) if total_runs > 0 else 0

    # DB size
    try:
        if "postgresql" in settings.DATABASE_URL:
            db_name = settings.DATABASE_URL.split("/")[-1].split("?")[0]
            db_size = db.execute(text(f"SELECT pg_database_size('{db_name}')")).scalar() or 0
        else:
            db_path = settings.DATABASE_URL.replace("sqlite:///", "")
            db_size = os.path.getsize(db_path) if os.path.exists(db_path) else 0
    except Exception:
        db_size = 0

    scheduler = get_scheduler_status()
    uptime_seconds = (datetime.now(timezone.utc) - _start_time).total_seconds()

    # Workflow stats
    total_workflows = db.query(func.count(Workflow.id)).scalar() or 0
    active_workflows = db.query(func.count(Workflow.id)).filter(Workflow.is_active == True).scalar() or 0
    wf_total_runs = db.query(func.count(WorkflowRun.id)).scalar() or 0
    wf_success_runs = db.query(func.count(WorkflowRun.id)).filter(WorkflowRun.status == "success").scalar() or 0
    wf_failed_runs = db.query(func.count(WorkflowRun.id)).filter(WorkflowRun.status == "failed").scalar() or 0
    wf_running_now = db.query(func.count(WorkflowRun.id)).filter(WorkflowRun.status == "running").scalar() or 0
    wf_success_rate = (wf_success_runs / wf_total_runs * 100) if wf_total_runs > 0 else 0

    return {
        "total_jobs": total_jobs,
        "active_jobs": active_jobs,
        "total_runs": total_runs,
        "success_runs": success_runs,
        "failed_runs": failed_runs,
        "running_now": running_now,
        "success_rate": round(success_rate, 1),
        "db_size_bytes": db_size,
        "scheduler_running": scheduler["running"],
        "scheduled_jobs": scheduler["job_count"],
        "uptime_seconds": int(uptime_seconds),
        # Workflow stats
        "total_workflows": total_workflows,
        "active_workflows": active_workflows,
        "wf_total_runs": wf_total_runs,
        "wf_success_runs": wf_success_runs,
        "wf_failed_runs": wf_failed_runs,
        "wf_running_now": wf_running_now,
        "wf_success_rate": round(wf_success_rate, 1),
    }


@router.get("/run-history")
def get_run_history(
    days: int = Query(14, ge=1, le=90),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get daily run counts grouped by status for the chart."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    # Job runs
    job_rows = (
        db.query(
            func.date(JobRun.created_at).label("date"),
            JobRun.status,
            func.count(JobRun.id).label("count"),
        )
        .filter(JobRun.created_at >= cutoff)
        .group_by(func.date(JobRun.created_at), JobRun.status)
        .order_by(func.date(JobRun.created_at))
        .all()
    )

    # Workflow runs
    wf_rows = (
        db.query(
            func.date(WorkflowRun.created_at).label("date"),
            WorkflowRun.status,
            func.count(WorkflowRun.id).label("count"),
        )
        .filter(WorkflowRun.created_at >= cutoff)
        .group_by(func.date(WorkflowRun.created_at), WorkflowRun.status)
        .order_by(func.date(WorkflowRun.created_at))
        .all()
    )

    # Build date map
    date_map: dict[str, dict] = {}
    current = cutoff.date()
    end = datetime.now(timezone.utc).date()
    while current <= end:
        d = current.isoformat()
        date_map[d] = {"date": d, "success": 0, "failed": 0, "cancelled": 0, "running": 0, "pending": 0}
        current += timedelta(days=1)

    for row in (*job_rows, *wf_rows):
        d = str(row.date)
        if d in date_map and row.status in date_map[d]:
            date_map[d][row.status] += row.count

    return list(date_map.values())
