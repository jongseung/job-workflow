"""Workflow service: CRUD + run management."""
import secrets
import uuid
from datetime import datetime, timezone

from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.models.workflow import Workflow, WorkflowRun, WorkflowNodeRun


# ─── Workflow CRUD ────────────────────────────────────────────────────────────

def list_workflows(db: Session, user_id: str | None = None) -> list[Workflow]:
    q = db.query(Workflow).order_by(desc(Workflow.updated_at))
    return q.all()


def get_workflow(db: Session, workflow_id: str) -> Workflow:
    wf = db.query(Workflow).filter(Workflow.id == workflow_id).first()
    if not wf:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Workflow not found")
    return wf


def create_workflow(db: Session, data: dict, user_id: str | None = None) -> Workflow:
    wf = Workflow(
        id=str(uuid.uuid4()),
        created_by=user_id,
        webhook_token=secrets.token_urlsafe(32),
        **data,
    )
    db.add(wf)
    db.commit()
    db.refresh(wf)
    return wf


def update_workflow(db: Session, workflow_id: str, data: dict) -> Workflow:
    wf = get_workflow(db, workflow_id)
    for key, val in data.items():
        if val is not None or key in ("canvas_data", "description", "cron_expression"):
            setattr(wf, key, val)
    wf.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(wf)
    return wf


def delete_workflow(db: Session, workflow_id: str):
    wf = get_workflow(db, workflow_id)
    db.delete(wf)
    db.commit()


def enrich_workflow_out(db: Session, wf: Workflow) -> dict:
    """Add computed fields to workflow response."""
    canvas = wf.canvas_data or {}
    node_count = len(canvas.get("nodes", []))

    # Last run info
    last_run = (
        db.query(WorkflowRun)
        .filter(WorkflowRun.workflow_id == wf.id)
        .order_by(desc(WorkflowRun.created_at))
        .first()
    )

    data = {
        "id": wf.id,
        "name": wf.name,
        "description": wf.description,
        "canvas_data": wf.canvas_data,
        "status": wf.status,
        "is_active": wf.is_active,
        "schedule_type": wf.schedule_type,
        "cron_expression": wf.cron_expression,
        "interval_seconds": wf.interval_seconds,
        "timeout_seconds": wf.timeout_seconds,
        "webhook_token": wf.webhook_token,
        "tags": wf.tags,
        "created_by": wf.created_by,
        "created_at": wf.created_at,
        "updated_at": wf.updated_at,
        "node_count": node_count,
        "last_run_status": last_run.status if last_run else None,
        "last_run_at": last_run.created_at if last_run else None,
    }
    return data


# ─── Workflow Run ─────────────────────────────────────────────────────────────

def create_run(
    db: Session, workflow_id: str,
    trigger_type: str = "manual",
    context_data: dict | None = None,
    triggered_by: str | None = None,
) -> WorkflowRun:
    run = WorkflowRun(
        id=str(uuid.uuid4()),
        workflow_id=workflow_id,
        status="pending",
        trigger_type=trigger_type,
        context_data=context_data or {},
        triggered_by=triggered_by,
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def list_runs(db: Session, workflow_id: str, limit: int = 20) -> list[WorkflowRun]:
    return (
        db.query(WorkflowRun)
        .filter(WorkflowRun.workflow_id == workflow_id)
        .order_by(desc(WorkflowRun.created_at))
        .limit(limit)
        .all()
    )


def get_run(db: Session, run_id: str) -> WorkflowRun:
    run = db.query(WorkflowRun).filter(WorkflowRun.id == run_id).first()
    if not run:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Workflow run not found")
    return run


def get_run_with_nodes(db: Session, run_id: str) -> dict:
    run = get_run(db, run_id)
    node_runs = (
        db.query(WorkflowNodeRun)
        .filter(WorkflowNodeRun.workflow_run_id == run_id)
        .order_by(WorkflowNodeRun.execution_order)
        .all()
    )
    return {"run": run, "node_runs": node_runs}
