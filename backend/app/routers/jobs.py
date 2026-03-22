import asyncio
import json

from fastapi import APIRouter, Depends, Query, Request, UploadFile, File
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.job import JobCreate, JobUpdate, JobResponse, JobListResponse
from app.schemas.common import MessageResponse
from app.services.job_service import get_jobs, get_job, create_job, update_job, delete_job, get_last_run
from app.services.audit_service import log_audit
from app.core.dependencies import get_current_user, require_role
from app.models.user import User
from app.models.job_run import JobRun
from app.services.execution_service import run_job, cancel_run
from app.scheduler.engine import register_job, unregister_job
from app.config import settings

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.get("")
def list_jobs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    schedule_type: str | None = None,
    is_active: bool | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    jobs, total = get_jobs(db, page, page_size, search, schedule_type, is_active)
    items = []
    for job in jobs:
        last_run = get_last_run(db, job.id)
        items.append({
            "id": job.id,
            "name": job.name,
            "description": job.description,
            "schedule_type": job.schedule_type,
            "is_active": job.is_active,
            "tags": job.tags_list,
            "created_at": job.created_at.isoformat(),
            "last_run_status": last_run.status if last_run else None,
            "last_run_at": last_run.started_at.isoformat() if last_run and last_run.started_at else None,
        })
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
    }


@router.post("", response_model=JobResponse)
def create_new_job(
    data: JobCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "operator")),
):
    # Validate DAG dependencies
    if data.depends_on:
        from app.services.dag_service import get_dag_service
        from fastapi import HTTPException
        dag = get_dag_service()
        result = dag.validate_dependencies(db, "", data.depends_on)
        if not result["valid"]:
            raise HTTPException(status_code=400, detail=result["error"])
    job = create_job(db, data, current_user.id)
    # Register with scheduler if needed
    if job.schedule_type != "manual" and job.is_active:
        register_job(job.id, job.schedule_type, job.cron_expression, job.interval_seconds)
    log_audit(db, "create_job", "job", user_id=current_user.id,
              resource_id=job.id, details={"name": job.name, "schedule_type": job.schedule_type},
              ip_address=request.client.host if request.client else None)
    return _job_to_response(job, db)


@router.get("/{job_id}", response_model=JobResponse)
def get_job_detail(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = get_job(db, job_id)
    return _job_to_response(job, db)


@router.put("/{job_id}", response_model=JobResponse)
def update_existing_job(
    job_id: str,
    data: JobUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "operator")),
):
    # Validate DAG dependencies
    if data.depends_on is not None:
        from app.services.dag_service import get_dag_service
        from fastapi import HTTPException
        dag = get_dag_service()
        result = dag.validate_dependencies(db, job_id, data.depends_on)
        if not result["valid"]:
            raise HTTPException(status_code=400, detail=result["error"])
    job = update_job(db, job_id, data)
    # Update scheduler
    if job.schedule_type != "manual" and job.is_active:
        register_job(job.id, job.schedule_type, job.cron_expression, job.interval_seconds)
    else:
        unregister_job(job.id)
    return _job_to_response(job, db)


@router.delete("/{job_id}", response_model=MessageResponse)
def delete_existing_job(
    job_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    job = get_job(db, job_id)
    log_audit(db, "delete_job", "job", user_id=current_user.id,
              resource_id=job_id, details={"name": job.name},
              ip_address=request.client.host if request.client else None)
    unregister_job(job_id)
    delete_job(db, job_id)
    return MessageResponse(message="Job deleted successfully")


@router.post("/{job_id}/run")
async def trigger_run(
    job_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "operator")),
):
    from app.services.queue_service import get_queue_service
    job = get_job(db, job_id)
    queue = get_queue_service()
    job_run = queue.enqueue(db, job.id, trigger_type="manual", triggered_by=current_user.id)

    log_audit(db, "trigger_run", "job_run", user_id=current_user.id,
              resource_id=job_run.id, details={"job_name": job.name, "job_id": job.id},
              ip_address=request.client.host if request.client else None)

    return {"run_id": job_run.id, "status": "queued"}


@router.post("/{job_id}/cancel", response_model=MessageResponse)
async def cancel_job_run(
    job_id: str,
    run_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "operator")),
):
    cancelled = await cancel_run(run_id)
    if cancelled:
        run = db.query(JobRun).filter(JobRun.id == run_id).first()
        if run:
            run.status = "cancelled"
            db.commit()
        return MessageResponse(message="Job run cancelled")
    return MessageResponse(message="No running process found for this run")


@router.put("/{job_id}/toggle", response_model=JobResponse)
def toggle_job(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "operator")),
):
    job = get_job(db, job_id)
    job.is_active = not job.is_active
    db.commit()
    db.refresh(job)
    if job.is_active and job.schedule_type != "manual":
        register_job(job.id, job.schedule_type, job.cron_expression, job.interval_seconds)
    else:
        unregister_job(job.id)
    return _job_to_response(job, db)


@router.post("/upload")
async def upload_job_file(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "operator")),
):
    if not file.filename or not file.filename.endswith(".py"):
        return {"error": "Only .py files are allowed"}

    content = await file.read()
    if len(content) > settings.MAX_CODE_SIZE_BYTES:
        return {"error": f"File too large. Max size: {settings.MAX_CODE_SIZE_BYTES} bytes"}

    code = content.decode("utf-8")
    name = file.filename.replace(".py", "").replace("_", " ").title()

    return {
        "name": name,
        "code": code,
        "code_filename": file.filename,
    }


@router.post("/{job_id}/clone")
def clone_job(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "operator")),
):
    original = get_job(db, job_id)
    from app.schemas.job import JobCreate
    clone_data = JobCreate(
        name=f"{original.name} (Copy)",
        description=original.description,
        code=original.code,
        schedule_type="manual",
        max_retries=original.max_retries,
        retry_delay_seconds=original.retry_delay_seconds,
        timeout_seconds=original.timeout_seconds,
        environment_vars=original.env_dict or None,
        tags=original.tags_list or None,
        datasource_id=original.datasource_id,
        save_to_datasource=original.save_to_datasource,
        target_table=original.target_table,
        output_format=getattr(original, "output_format", "jsonl") or "jsonl",
        write_mode=getattr(original, "write_mode", "append") or "append",
        upsert_key=getattr(original, "upsert_key", None),
        notify_webhook_url=getattr(original, "notify_webhook_url", None),
        notify_on=getattr(original, "notify_on", "failure") or "failure",
        priority=getattr(original, "priority", 5) or 5,
        requirements=getattr(original, "requirements", None),
        max_concurrent=getattr(original, "max_concurrent", 1) or 1,
        is_active=False,
    )
    new_job = create_job(db, clone_data, current_user.id)
    return _job_to_response(new_job, db)


@router.post("/bulk")
def bulk_action(
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "operator")),
):
    from app.services.queue_service import get_queue_service
    job_ids = body.get("job_ids", [])
    action = body.get("action", "")
    results = []

    for jid in job_ids:
        try:
            job = get_job(db, jid)
            if action == "run":
                queue = get_queue_service()
                queue.enqueue(db, jid, trigger_type="manual", triggered_by=current_user.id)
                results.append({"job_id": jid, "status": "ok"})
            elif action == "activate":
                job.is_active = True
                db.commit()
                if job.schedule_type != "manual":
                    register_job(job.id, job.schedule_type, job.cron_expression, job.interval_seconds)
                results.append({"job_id": jid, "status": "ok"})
            elif action == "deactivate":
                job.is_active = False
                db.commit()
                unregister_job(job.id)
                results.append({"job_id": jid, "status": "ok"})
            elif action == "delete":
                unregister_job(jid)
                delete_job(db, jid)
                results.append({"job_id": jid, "status": "ok"})
            else:
                results.append({"job_id": jid, "status": "error", "message": f"Unknown action: {action}"})
        except Exception as e:
            results.append({"job_id": jid, "status": "error", "message": str(e)})

    success = sum(1 for r in results if r["status"] == "ok")
    failed = sum(1 for r in results if r["status"] == "error")
    return {"success": success, "failed": failed, "results": results}


@router.get("/{job_id}/dependencies")
def get_job_dependencies(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.services.dag_service import get_dag_service
    dag = get_dag_service()
    return dag.get_dependencies(db, job_id)


def _job_to_response(job, db: Session) -> dict:
    last_run = get_last_run(db, job.id)
    return {
        "id": job.id,
        "name": job.name,
        "description": job.description,
        "code": job.code,
        "code_filename": job.code_filename,
        "schedule_type": job.schedule_type,
        "cron_expression": job.cron_expression,
        "interval_seconds": job.interval_seconds,
        "is_active": job.is_active,
        "max_retries": job.max_retries,
        "retry_delay_seconds": job.retry_delay_seconds,
        "timeout_seconds": job.timeout_seconds,
        "environment_vars": job.env_dict or None,
        "tags": job.tags_list or None,
        "created_by": job.created_by,
        "datasource_id": job.datasource_id,
        "save_to_datasource": job.save_to_datasource,
        "target_table": job.target_table,
        "output_format": getattr(job, "output_format", "jsonl") or "jsonl",
        "write_mode": getattr(job, "write_mode", "append") or "append",
        "upsert_key": getattr(job, "upsert_key", None),
        "notify_webhook_url": getattr(job, "notify_webhook_url", None),
        "notify_on": getattr(job, "notify_on", "failure") or "failure",
        "priority": getattr(job, "priority", 5) or 5,
        "requirements": getattr(job, "requirements", None),
        "max_concurrent": getattr(job, "max_concurrent", 1) or 1,
        "depends_on": job.depends_on_list if hasattr(job, "depends_on_list") else None,
        "created_at": job.created_at.isoformat(),
        "updated_at": job.updated_at.isoformat() if job.updated_at else None,
        "last_run_status": last_run.status if last_run else None,
    }
