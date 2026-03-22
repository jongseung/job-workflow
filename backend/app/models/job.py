import uuid
import json
from datetime import datetime, timezone

from sqlalchemy import String, Text, Boolean, Integer, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    code: Mapped[str] = mapped_column(Text, nullable=False)
    code_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    schedule_type: Mapped[str] = mapped_column(
        SAEnum("cron", "interval", "manual", name="schedule_type"),
        nullable=False,
        default="manual",
    )
    cron_expression: Mapped[str | None] = mapped_column(String(100), nullable=True)
    interval_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    max_retries: Mapped[int] = mapped_column(Integer, default=0)
    retry_delay_seconds: Mapped[int] = mapped_column(Integer, default=60)
    timeout_seconds: Mapped[int] = mapped_column(Integer, default=3600)
    environment_vars: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON
    tags: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON
    datasource_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("datasources.id"), nullable=True
    )
    save_to_datasource: Mapped[bool] = mapped_column(Boolean, default=False)
    target_table: Mapped[str | None] = mapped_column(String(200), nullable=True)
    output_format: Mapped[str] = mapped_column(String(10), default="jsonl")  # jsonl or csv
    write_mode: Mapped[str] = mapped_column(String(10), default="append")  # append|replace|upsert
    upsert_key: Mapped[str | None] = mapped_column(String(500), nullable=True)  # comma-separated column names
    notify_webhook_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    notify_on: Mapped[str] = mapped_column(String(20), default="failure")  # success|failure|both|none
    priority: Mapped[int] = mapped_column(Integer, default=5)  # 1 (highest) to 10 (lowest)
    requirements: Mapped[str | None] = mapped_column(Text, nullable=True)  # pip format
    max_concurrent: Mapped[int] = mapped_column(Integer, default=1)  # 0=unlimited, 1=no dupes
    depends_on: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON: ["job_id_1", ...]
    created_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, onupdate=lambda: datetime.now(timezone.utc)
    )

    creator = relationship("User", back_populates="jobs")
    datasource = relationship("DataSource", foreign_keys=[datasource_id])
    runs = relationship("JobRun", back_populates="job", cascade="all, delete-orphan", lazy="dynamic")

    @property
    def env_dict(self) -> dict:
        if self.environment_vars:
            return json.loads(self.environment_vars)
        return {}

    @property
    def tags_list(self) -> list[str]:
        if self.tags:
            return json.loads(self.tags)
        return []

    @property
    def depends_on_list(self) -> list[str]:
        if self.depends_on:
            try:
                return json.loads(self.depends_on)
            except (json.JSONDecodeError, TypeError):
                return []
        return []

    @property
    def requirements_hash(self) -> str | None:
        import hashlib
        if not self.requirements or not self.requirements.strip():
            return None
        normalized = "\n".join(
            sorted(line.strip().lower() for line in self.requirements.strip().splitlines() if line.strip())
        )
        return hashlib.sha256(normalized.encode()).hexdigest()[:16]
