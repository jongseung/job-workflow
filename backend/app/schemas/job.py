from datetime import datetime
from pydantic import BaseModel, Field


class JobBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    code: str = Field(..., min_length=1)
    schedule_type: str = Field(default="manual", pattern="^(cron|interval|manual)$")
    cron_expression: str | None = None
    interval_seconds: int | None = Field(default=None, ge=1)
    is_active: bool = True
    max_retries: int = Field(default=0, ge=0, le=10)
    retry_delay_seconds: int = Field(default=60, ge=1)
    timeout_seconds: int = Field(default=3600, ge=1, le=86400)
    environment_vars: dict[str, str] | None = None
    tags: list[str] | None = None
    datasource_id: str | None = None
    save_to_datasource: bool = False
    target_table: str | None = None
    output_format: str = Field(default="jsonl", pattern="^(jsonl|csv)$")
    write_mode: str = Field(default="append", pattern="^(append|replace|upsert)$")
    upsert_key: str | None = None
    notify_webhook_url: str | None = None
    notify_on: str = Field(default="failure", pattern="^(success|failure|both|none)$")
    priority: int = Field(default=5, ge=1, le=10)
    requirements: str | None = None
    max_concurrent: int = Field(default=1, ge=0, le=20)
    depends_on: list[str] | None = None


class JobCreate(JobBase):
    pass


class JobUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = None
    code: str | None = None
    schedule_type: str | None = Field(default=None, pattern="^(cron|interval|manual)$")
    cron_expression: str | None = None
    interval_seconds: int | None = Field(default=None, ge=1)
    is_active: bool | None = None
    max_retries: int | None = Field(default=None, ge=0, le=10)
    retry_delay_seconds: int | None = Field(default=None, ge=1)
    timeout_seconds: int | None = Field(default=None, ge=1, le=86400)
    environment_vars: dict[str, str] | None = None
    tags: list[str] | None = None
    datasource_id: str | None = None
    save_to_datasource: bool | None = None
    target_table: str | None = None
    output_format: str | None = Field(default=None, pattern="^(jsonl|csv)$")
    write_mode: str | None = Field(default=None, pattern="^(append|replace|upsert)$")
    upsert_key: str | None = None
    notify_webhook_url: str | None = None
    notify_on: str | None = Field(default=None, pattern="^(success|failure|both|none)$")
    priority: int | None = Field(default=None, ge=1, le=10)
    requirements: str | None = None
    max_concurrent: int | None = Field(default=None, ge=0, le=20)
    depends_on: list[str] | None = None


class JobResponse(BaseModel):
    id: str
    name: str
    description: str | None = None
    code: str
    code_filename: str | None = None
    schedule_type: str
    cron_expression: str | None = None
    interval_seconds: int | None = None
    is_active: bool
    max_retries: int
    retry_delay_seconds: int
    timeout_seconds: int
    environment_vars: dict[str, str] | None = None
    tags: list[str] | None = None
    datasource_id: str | None = None
    save_to_datasource: bool = False
    target_table: str | None = None
    output_format: str = "jsonl"
    write_mode: str = "append"
    upsert_key: str | None = None
    notify_webhook_url: str | None = None
    notify_on: str = "failure"
    priority: int = 5
    requirements: str | None = None
    max_concurrent: int = 1
    depends_on: list[str] | None = None
    created_by: str | None = None
    created_at: datetime
    updated_at: datetime | None = None
    last_run_status: str | None = None
    next_run_time: str | None = None

    class Config:
        from_attributes = True


class JobListResponse(BaseModel):
    id: str
    name: str
    description: str | None = None
    schedule_type: str
    is_active: bool
    tags: list[str] | None = None
    created_at: datetime
    last_run_status: str | None = None
    last_run_at: datetime | None = None

    class Config:
        from_attributes = True
