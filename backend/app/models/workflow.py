import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Text, Boolean, DateTime, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Workflow(Base):
    __tablename__ = "workflows"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # React Flow full state: {nodes: [...], edges: [...]}
    canvas_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # draft | active | archived
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft", index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)

    # Scheduling (reuse v1 pattern)
    schedule_type: Mapped[str] = mapped_column(String(20), nullable=False, default="manual")
    cron_expression: Mapped[str | None] = mapped_column(String(100), nullable=True)
    interval_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)

    timeout_seconds: Mapped[int] = mapped_column(Integer, default=3600)
    max_concurrent: Mapped[int] = mapped_column(Integer, default=1)

    # Webhook trigger
    webhook_token: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)

    # Tags stored as JSON array
    tags: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    created_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, onupdate=lambda: datetime.now(timezone.utc)
    )

    creator = relationship("User", foreign_keys=[created_by])
    runs = relationship("WorkflowRun", back_populates="workflow", cascade="all, delete-orphan", lazy="dynamic")


class WorkflowRun(Base):
    __tablename__ = "workflow_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    workflow_id: Mapped[str] = mapped_column(String(36), ForeignKey("workflows.id"), nullable=False, index=True)

    # pending | running | success | failed | cancelled
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True)
    # manual | scheduled | webhook
    trigger_type: Mapped[str] = mapped_column(String(20), nullable=False, default="manual")

    # Initial input context passed to the trigger node
    context_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    triggered_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    workflow = relationship("Workflow", back_populates="runs")
    node_runs = relationship(
        "WorkflowNodeRun", back_populates="workflow_run",
        cascade="all, delete-orphan", order_by="WorkflowNodeRun.execution_order"
    )
    triggerer = relationship("User", foreign_keys=[triggered_by])


class WorkflowNodeRun(Base):
    __tablename__ = "workflow_node_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    workflow_run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("workflow_runs.id"), nullable=False, index=True
    )

    node_id: Mapped[str] = mapped_column(String(100), nullable=False)  # canvas node id
    module_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("modules.id"), nullable=True)
    node_type: Mapped[str] = mapped_column(String(50), nullable=False)
    node_label: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # pending | running | success | failed | skipped
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")

    input_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    output_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    execution_order: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    workflow_run = relationship("WorkflowRun", back_populates="node_runs")
    module = relationship("StepModule", foreign_keys=[module_id])
