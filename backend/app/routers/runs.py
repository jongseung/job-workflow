from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.database import get_db
from app.models.job_run import JobRun
from app.schemas.job_run import JobRunResponse
from app.core.dependencies import get_current_user
from app.models.user import User

router = APIRouter(tags=["runs"])


@router.get("/api/jobs/{job_id}/runs")
def get_job_runs(
    job_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(JobRun).filter(JobRun.job_id == job_id)
    if status:
        query = query.filter(JobRun.status == status)
    total = query.count()
    runs = query.order_by(desc(JobRun.created_at)).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "items": [JobRunResponse.model_validate(r).model_dump() for r in runs],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/api/jobs/{job_id}/runs/{run_id}", response_model=JobRunResponse)
def get_run_detail(
    job_id: str,
    run_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    run = db.query(JobRun).filter(JobRun.id == run_id, JobRun.job_id == job_id).first()
    if not run:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("Run not found")
    return run


@router.get("/api/runs/recent")
def get_recent_runs(
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    runs = (
        db.query(JobRun)
        .order_by(desc(JobRun.created_at))
        .limit(limit)
        .all()
    )
    result = []
    for r in runs:
        data = JobRunResponse.model_validate(r).model_dump()
        data["job_name"] = r.job.name if r.job else None
        result.append(data)
    return result
