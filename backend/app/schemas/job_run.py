from datetime import datetime
from pydantic import BaseModel


class JobRunResponse(BaseModel):
    id: str
    job_id: str
    status: str
    trigger_type: str
    attempt_number: int
    started_at: datetime | None = None
    finished_at: datetime | None = None
    duration_ms: int | None = None
    exit_code: int | None = None
    error_message: str | None = None
    triggered_by: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class RunTriggerRequest(BaseModel):
    pass  # Future: allow params override
