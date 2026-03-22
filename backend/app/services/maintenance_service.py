"""
Maintenance Service: Automated cleanup operations.

- History retention: delete old runs + logs beyond RETENTION_DAYS
- venv cleanup: remove unused venvs beyond VENV_MAX_AGE_DAYS
- Orphaned run recovery on startup
"""

import logging
from datetime import datetime, timezone, timedelta

from app.database import SessionLocal
from app.models.job_run import JobRun
from app.models.job_log import JobLog

logger = logging.getLogger(__name__)


class MaintenanceService:

    async def cleanup_history(self, retention_days: int = 30) -> dict:
        """Delete runs and logs older than retention_days."""
        cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
        db = SessionLocal()
        try:
            old_runs = db.query(JobRun).filter(
                JobRun.created_at < cutoff,
                JobRun.status.in_(["success", "failed", "cancelled", "skipped"]),
            ).all()

            run_ids = [r.id for r in old_runs]
            if not run_ids:
                return {"deleted_runs": 0, "deleted_logs": 0}

            deleted_logs = db.query(JobLog).filter(
                JobLog.job_run_id.in_(run_ids)
            ).delete(synchronize_session=False)

            deleted_runs = db.query(JobRun).filter(
                JobRun.id.in_(run_ids)
            ).delete(synchronize_session=False)

            db.commit()
            logger.info(f"Cleanup: deleted {deleted_runs} runs, {deleted_logs} logs")
            return {"deleted_runs": deleted_runs, "deleted_logs": deleted_logs}
        finally:
            db.close()

    async def recover_orphaned_runs(self) -> int:
        """Mark 'running'/'queued' runs as 'failed' on startup."""
        db = SessionLocal()
        try:
            orphans = db.query(JobRun).filter(
                JobRun.status.in_(["running", "queued"])
            ).all()

            count = 0
            for run in orphans:
                run.status = "failed"
                run.error_message = "Server restarted while job was running"
                run.finished_at = datetime.now(timezone.utc)
                count += 1

            if count:
                db.commit()
                logger.info(f"Recovered {count} orphaned runs")
            return count
        finally:
            db.close()

    async def cleanup_venvs(self, max_age_days: int = 30) -> int:
        from app.services.venv_manager import get_venv_manager
        mgr = get_venv_manager()
        return await mgr.cleanup_stale(max_age_days)
