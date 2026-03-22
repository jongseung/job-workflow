import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Text, Boolean, DateTime, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class StepModule(Base):
    __tablename__ = "modules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # action | data | transform | condition | trigger | merge
    module_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    # slack | email | db | http | logic | etc.
    category: Mapped[str] = mapped_column(String(50), nullable=False, default="general")
    icon: Mapped[str | None] = mapped_column(String(100), nullable=True)   # emoji or icon name
    color: Mapped[str | None] = mapped_column(String(20), nullable=True, default="#6366f1")

    # JSON Schema for input form, output shape, and module config
    input_schema: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    output_schema: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    config_schema: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Execution: python | http | sql | builtin
    executor_type: Mapped[str] = mapped_column(String(20), nullable=False, default="python")
    executor_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    executor_config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    is_builtin: Mapped[bool] = mapped_column(Boolean, default=False)  # system-provided modules

    created_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, onupdate=lambda: datetime.now(timezone.utc)
    )

    creator = relationship("User", foreign_keys=[created_by])
