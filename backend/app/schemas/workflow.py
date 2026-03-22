from datetime import datetime
from typing import Any
from pydantic import BaseModel, Field


# ─── Workflow ──────────────────────────────────────────────────────────────────

class WorkflowCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    canvas_data: dict | None = None
    schedule_type: str = Field("manual", pattern="^(manual|cron|interval)$")
    cron_expression: str | None = None
    interval_seconds: int | None = None
    timeout_seconds: int = 3600
    tags: list[str] | None = None


class WorkflowUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = None
    canvas_data: dict | None = None
    status: str | None = Field(None, pattern="^(draft|active|archived)$")
    is_active: bool | None = None
    schedule_type: str | None = Field(None, pattern="^(manual|cron|interval)$")
    cron_expression: str | None = None
    interval_seconds: int | None = None
    timeout_seconds: int | None = None
    tags: list[str] | None = None


class WorkflowOut(BaseModel):
    id: str
    name: str
    description: str | None
    canvas_data: dict | None
    status: str
    is_active: bool
    schedule_type: str
    cron_expression: str | None
    interval_seconds: int | None
    timeout_seconds: int
    webhook_token: str | None
    tags: list | None
    created_by: str | None
    created_at: datetime
    updated_at: datetime | None
    # computed
    node_count: int = 0
    last_run_status: str | None = None
    last_run_at: datetime | None = None
    next_run_at: str | None = None  # ISO string from APScheduler

    model_config = {"from_attributes": True}


# ─── Workflow Run ───────────────────────────────────────────────────────────────

class WorkflowTrigger(BaseModel):
    context_data: dict[str, Any] = {}


class WorkflowRunOut(BaseModel):
    id: str
    workflow_id: str
    status: str
    trigger_type: str
    context_data: dict | None
    started_at: datetime | None
    finished_at: datetime | None
    duration_ms: int | None
    error_message: str | None
    triggered_by: str | None
    created_at: datetime
    node_runs: list["WorkflowNodeRunOut"] = []

    model_config = {"from_attributes": True}


class WorkflowNodeRunOut(BaseModel):
    id: str
    workflow_run_id: str
    node_id: str
    module_id: str | None
    node_type: str
    node_label: str | None
    status: str
    input_data: dict | None
    output_data: dict | None
    error_message: str | None
    started_at: datetime | None
    finished_at: datetime | None
    duration_ms: int | None
    execution_order: int
    created_at: datetime

    model_config = {"from_attributes": True}


WorkflowRunOut.model_rebuild()
