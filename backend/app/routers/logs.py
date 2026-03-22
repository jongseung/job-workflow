from fastapi import APIRouter, Depends, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session
from sqlalchemy import asc

from app.database import get_db
from app.models.job_log import JobLog
from app.schemas.job_log import JobLogResponse
from app.core.dependencies import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/logs", tags=["logs"])


@router.get("/{run_id}")
def get_run_logs(
    run_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=1000),
    stream: str | None = None,
    level: str | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(JobLog).filter(JobLog.job_run_id == run_id)
    if stream:
        query = query.filter(JobLog.stream == stream)
    if level:
        query = query.filter(JobLog.level == level)
    if search:
        query = query.filter(JobLog.message.ilike(f"%{search}%"))

    total = query.count()
    logs = (
        query.order_by(asc(JobLog.line_number))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return {
        "items": [JobLogResponse.model_validate(log).model_dump() for log in logs],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/{run_id}/download")
def download_logs(
    run_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    logs = (
        db.query(JobLog)
        .filter(JobLog.job_run_id == run_id)
        .order_by(asc(JobLog.line_number))
        .all()
    )
    text = "\n".join(
        f"[{log.timestamp.isoformat()}] [{log.stream}] [{log.level}] {log.message}"
        for log in logs
    )
    return PlainTextResponse(
        content=text,
        media_type="text/plain",
        headers={"Content-Disposition": f"attachment; filename=logs_{run_id}.txt"},
    )
