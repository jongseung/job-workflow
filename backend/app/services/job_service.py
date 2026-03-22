import json
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.models.job import Job
from app.models.job_run import JobRun
from app.schemas.job import JobCreate, JobUpdate
from app.core.exceptions import NotFoundError, ConflictError


def get_jobs(
    db: Session,
    page: int = 1,
    page_size: int = 20,
    search: str | None = None,
    schedule_type: str | None = None,
    is_active: bool | None = None,
    tags: list[str] | None = None,
) -> tuple[list[Job], int]:
    query = db.query(Job)

    if search:
        query = query.filter(Job.name.ilike(f"%{search}%"))
    if schedule_type:
        query = query.filter(Job.schedule_type == schedule_type)
    if is_active is not None:
        query = query.filter(Job.is_active == is_active)

    total = query.count()
    jobs = query.order_by(desc(Job.created_at)).offset((page - 1) * page_size).limit(page_size).all()
    return jobs, total


def get_job(db: Session, job_id: str) -> Job:
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise NotFoundError(f"Job {job_id} not found")
    return job


def create_job(db: Session, data: JobCreate, user_id: str) -> Job:
    existing = db.query(Job).filter(Job.name == data.name).first()
    if existing:
        raise ConflictError(f"Job with name '{data.name}' already exists")

    job = Job(
        name=data.name,
        description=data.description,
        code=data.code,
        schedule_type=data.schedule_type,
        cron_expression=data.cron_expression,
        interval_seconds=data.interval_seconds,
        is_active=data.is_active,
        max_retries=data.max_retries,
        retry_delay_seconds=data.retry_delay_seconds,
        timeout_seconds=data.timeout_seconds,
        environment_vars=json.dumps(data.environment_vars) if data.environment_vars else None,
        tags=json.dumps(data.tags) if data.tags else None,
        datasource_id=data.datasource_id,
        save_to_datasource=data.save_to_datasource,
        target_table=data.target_table,
        output_format=data.output_format,
        write_mode=data.write_mode,
        upsert_key=data.upsert_key,
        notify_webhook_url=data.notify_webhook_url,
        notify_on=data.notify_on,
        priority=data.priority,
        requirements=data.requirements,
        max_concurrent=data.max_concurrent,
        depends_on=json.dumps(data.depends_on) if data.depends_on else None,
        created_by=user_id,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def update_job(db: Session, job_id: str, data: JobUpdate) -> Job:
    job = get_job(db, job_id)
    update_data = data.model_dump(exclude_unset=True)

    if "environment_vars" in update_data and update_data["environment_vars"] is not None:
        update_data["environment_vars"] = json.dumps(update_data["environment_vars"])
    if "tags" in update_data and update_data["tags"] is not None:
        update_data["tags"] = json.dumps(update_data["tags"])
    if "depends_on" in update_data and update_data["depends_on"] is not None:
        update_data["depends_on"] = json.dumps(update_data["depends_on"])

    for key, value in update_data.items():
        setattr(job, key, value)

    db.commit()
    db.refresh(job)
    return job


def delete_job(db: Session, job_id: str) -> None:
    job = get_job(db, job_id)
    db.delete(job)
    db.commit()


def get_last_run(db: Session, job_id: str) -> JobRun | None:
    return (
        db.query(JobRun)
        .filter(JobRun.job_id == job_id)
        .order_by(desc(JobRun.created_at))
        .first()
    )
