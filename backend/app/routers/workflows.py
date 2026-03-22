import asyncio
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.workflow import Workflow
from app.schemas.workflow import (
    WorkflowCreate, WorkflowUpdate, WorkflowOut,
    WorkflowTrigger, WorkflowRunOut, WorkflowNodeRunOut,
)
from app.services import workflow_service
from app.scheduler.engine import register_workflow, unregister_workflow, get_workflow_next_run

router = APIRouter(prefix="/api/workflows", tags=["workflows"])


class WorkflowScheduleUpdate(BaseModel):
    schedule_type: str = Field(..., pattern="^(manual|cron|interval)$")
    cron_expression: str | None = None
    interval_seconds: int | None = None
    is_active: bool | None = None


# ─── Workflow CRUD ────────────────────────────────────────────────────────────

@router.get("", response_model=list[WorkflowOut])
def list_workflows(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    workflows = workflow_service.list_workflows(db)
    return [workflow_service.enrich_workflow_out(db, wf) for wf in workflows]


@router.get("/{workflow_id}", response_model=WorkflowOut)
def get_workflow(
    workflow_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    wf = workflow_service.get_workflow(db, workflow_id)
    return workflow_service.enrich_workflow_out(db, wf)


@router.post("", response_model=WorkflowOut, status_code=201)
def create_workflow(
    payload: WorkflowCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    wf = workflow_service.create_workflow(db, payload.model_dump(exclude_none=True), user_id=current_user.id)
    return workflow_service.enrich_workflow_out(db, wf)


@router.put("/{workflow_id}", response_model=WorkflowOut)
def update_workflow(
    workflow_id: str,
    payload: WorkflowUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    updates = payload.model_dump(exclude_none=True)
    wf = workflow_service.update_workflow(db, workflow_id, updates, user_id=current_user.id)

    # Sync scheduler if schedule-related fields changed
    schedule_fields = {"schedule_type", "cron_expression", "interval_seconds", "is_active"}
    if schedule_fields & set(updates.keys()):
        if wf.is_active and wf.schedule_type in ("cron", "interval"):
            register_workflow(wf.id, wf.schedule_type, wf.cron_expression, wf.interval_seconds)
        else:
            unregister_workflow(wf.id)

    return workflow_service.enrich_workflow_out(db, wf)


@router.delete("/{workflow_id}", status_code=204)
def delete_workflow(
    workflow_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    unregister_workflow(workflow_id)
    workflow_service.delete_workflow(db, workflow_id)


@router.post("/{workflow_id}/schedule", response_model=WorkflowOut)
def set_workflow_schedule(
    workflow_id: str,
    payload: WorkflowScheduleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Set or update the schedule for a workflow."""
    updates: dict[str, Any] = {"schedule_type": payload.schedule_type}
    if payload.cron_expression is not None:
        updates["cron_expression"] = payload.cron_expression
    if payload.interval_seconds is not None:
        updates["interval_seconds"] = payload.interval_seconds
    if payload.is_active is not None:
        updates["is_active"] = payload.is_active

    # Clear irrelevant fields
    if payload.schedule_type == "cron":
        updates["interval_seconds"] = None
    elif payload.schedule_type == "interval":
        updates["cron_expression"] = None
    elif payload.schedule_type == "manual":
        updates["cron_expression"] = None
        updates["interval_seconds"] = None

    wf = workflow_service.update_workflow(db, workflow_id, updates, user_id=current_user.id)

    # Register or unregister
    if wf.is_active and wf.schedule_type in ("cron", "interval"):
        register_workflow(wf.id, wf.schedule_type, wf.cron_expression, wf.interval_seconds)
    else:
        unregister_workflow(wf.id)

    enriched = workflow_service.enrich_workflow_out(db, wf)
    # Attach next_run info
    next_run = get_workflow_next_run(wf.id)
    if isinstance(enriched, dict):
        enriched["next_run_at"] = next_run
    return enriched


@router.get("/{workflow_id}/schedule")
def get_workflow_schedule(
    workflow_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get scheduling info including next scheduled run time."""
    wf = workflow_service.get_workflow(db, workflow_id)
    next_run = get_workflow_next_run(workflow_id)
    return {
        "workflow_id": workflow_id,
        "schedule_type": wf.schedule_type,
        "cron_expression": wf.cron_expression,
        "interval_seconds": wf.interval_seconds,
        "is_active": wf.is_active,
        "next_run_at": next_run,
    }


# ─── Execution ────────────────────────────────────────────────────────────────

@router.post("/{workflow_id}/run", response_model=WorkflowRunOut)
async def trigger_workflow(
    workflow_id: str,
    payload: WorkflowTrigger,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    wf = workflow_service.get_workflow(db, workflow_id)
    if not wf.canvas_data or not wf.canvas_data.get("nodes"):
        raise HTTPException(status_code=400, detail="Workflow has no nodes. Open the editor and add nodes first.")

    run = workflow_service.create_run(
        db, workflow_id,
        trigger_type="manual",
        context_data=payload.context_data,
        triggered_by=current_user.id,
    )

    # Execute in background so the API returns immediately
    from app.services.workflow_execution_service import run_workflow
    canvas = wf.canvas_data

    background_tasks.add_task(run_workflow, run.id, canvas, payload.context_data)

    return _run_to_dict(run)


@router.post("/{workflow_id}/webhook")
async def webhook_trigger(
    workflow_id: str,
    token: str,
    payload: dict = {},
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db),
):
    wf = workflow_service.get_workflow(db, workflow_id)
    if wf.webhook_token != token:
        raise HTTPException(status_code=403, detail="Invalid webhook token")

    run = workflow_service.create_run(db, workflow_id, trigger_type="webhook", context_data=payload)

    from app.services.workflow_execution_service import run_workflow
    background_tasks.add_task(run_workflow, run.id, wf.canvas_data or {}, payload)

    return {"run_id": run.id, "status": "queued"}


# ─── Runs ─────────────────────────────────────────────────────────────────────

@router.get("/{workflow_id}/runs", response_model=list[WorkflowRunOut])
def list_runs(
    workflow_id: str,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    runs = workflow_service.list_runs(db, workflow_id, limit)
    return [_run_to_dict(r) for r in runs]


@router.get("/runs/{run_id}", response_model=WorkflowRunOut)
def get_run(
    run_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = workflow_service.get_run_with_nodes(db, run_id)
    return {
        **_run_to_dict(data["run"]),
        "node_runs": [_node_run_to_dict(nr) for nr in data["node_runs"]],
    }


# ─── Node Test ────────────────────────────────────────────────────────────────

class NodeTestRequest(BaseModel):
    node_data: dict          # full node.data from the canvas
    input_data: dict = {}    # mock upstream data for testing


@router.post("/{workflow_id}/nodes/{node_id}/test")
async def test_node(
    workflow_id: str,
    node_id: str,
    body: NodeTestRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Execute a single workflow node in isolation for testing purposes."""
    from app.services.workflow_execution_service import _route_executor
    from app.models.module import StepModule

    nd = body.node_data
    module_id = nd.get("moduleId")
    module = db.query(StepModule).filter(StepModule.id == module_id).first() if module_id else None
    node_type: str = nd.get("moduleType", "action")

    # Merge static config + mock input
    full_input = {**(nd.get("config") or {}), **body.input_data}

    try:
        output = await _route_executor(node_type, module, full_input, nd)
        return {"status": "success", "output": output}
    except Exception as exc:
        return {"status": "error", "error": str(exc)}


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _run_to_dict(run) -> dict:
    return {
        "id": run.id,
        "workflow_id": run.workflow_id,
        "status": run.status,
        "trigger_type": run.trigger_type,
        "context_data": run.context_data,
        "started_at": run.started_at,
        "finished_at": run.finished_at,
        "duration_ms": run.duration_ms,
        "error_message": run.error_message,
        "triggered_by": run.triggered_by,
        "created_at": run.created_at,
        "node_runs": [],
    }


def _node_run_to_dict(nr) -> dict:
    return {
        "id": nr.id,
        "workflow_run_id": nr.workflow_run_id,
        "node_id": nr.node_id,
        "module_id": nr.module_id,
        "node_type": nr.node_type,
        "node_label": nr.node_label,
        "status": nr.status,
        "input_data": nr.input_data,
        "output_data": nr.output_data,
        "error_message": nr.error_message,
        "started_at": nr.started_at,
        "finished_at": nr.finished_at,
        "duration_ms": nr.duration_ms,
        "execution_order": nr.execution_order,
        "created_at": nr.created_at,
    }
