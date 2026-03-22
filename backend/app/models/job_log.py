from datetime import datetime, timezone

from sqlalchemy import Integer, String, Text, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class JobLog(Base):
    __tablename__ = "job_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_run_id: Mapped[str] = mapped_column(String(36), ForeignKey("job_runs.id"), nullable=False, index=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    stream: Mapped[str] = mapped_column(
        SAEnum("stdout", "stderr", "system", name="log_stream"),
        nullable=False,
        default="stdout",
    )
    level: Mapped[str] = mapped_column(
        SAEnum("debug", "info", "warning", "error", name="log_level"),
        nullable=False,
        default="info",
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)
    line_number: Mapped[int] = mapped_column(Integer, nullable=False)

    job_run = relationship("JobRun", back_populates="logs")
