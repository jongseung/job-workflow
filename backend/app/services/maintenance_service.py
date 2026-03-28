"""
Maintenance Service: Automated cleanup operations.

- History retention: delete old runs + logs beyond RETENTION_DAYS
- venv cleanup: remove unused venvs beyond VENV_MAX_AGE_DAYS
- Orphaned run recovery on startup
"""

import logging
from datetime import datetime, timedelta, timezone

from app.database import SessionLocal
from app.models.job_run import JobRun
from app.models.job_log import JobLog
from app.models.workflow import WorkflowRun, WorkflowNodeRun

logger = logging.getLogger(__name__)

# Default retention: 3 days
LOG_RETENTION_DAYS = 3


class MaintenanceService:

    async def cleanup_history(self, retention_days: int = LOG_RETENTION_DAYS) -> dict:
        """Delete job runs/logs AND workflow runs/node-runs older than retention_days."""
        cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
        db = SessionLocal()
        try:
            # ── Job runs + logs ──────────────────────────────────────────────
            old_job_runs = db.query(JobRun).filter(
                JobRun.created_at < cutoff,
                JobRun.status.in_(["success", "failed", "cancelled", "skipped"]),
            ).all()

            job_run_ids = [r.id for r in old_job_runs]
            deleted_job_logs = 0
            deleted_job_runs = 0

            if job_run_ids:
                deleted_job_logs = db.query(JobLog).filter(
                    JobLog.job_run_id.in_(job_run_ids)
                ).delete(synchronize_session=False)

                deleted_job_runs = db.query(JobRun).filter(
                    JobRun.id.in_(job_run_ids)
                ).delete(synchronize_session=False)

            # ── Workflow runs + node runs ────────────────────────────────────
            old_wf_runs = db.query(WorkflowRun).filter(
                WorkflowRun.created_at < cutoff,
                WorkflowRun.status.in_(["success", "failed", "cancelled", "skipped"]),
            ).all()

            wf_run_ids = [r.id for r in old_wf_runs]
            deleted_node_runs = 0
            deleted_wf_runs = 0

            if wf_run_ids:
                deleted_node_runs = db.query(WorkflowNodeRun).filter(
                    WorkflowNodeRun.workflow_run_id.in_(wf_run_ids)
                ).delete(synchronize_session=False)

                deleted_wf_runs = db.query(WorkflowRun).filter(
                    WorkflowRun.id.in_(wf_run_ids)
                ).delete(synchronize_session=False)

            db.commit()

            total_deleted = deleted_job_runs + deleted_job_logs + deleted_wf_runs + deleted_node_runs
            if total_deleted > 0:
                logger.info(
                    f"Cleanup (retention={retention_days}d): "
                    f"job_runs={deleted_job_runs}, job_logs={deleted_job_logs}, "
                    f"wf_runs={deleted_wf_runs}, wf_node_runs={deleted_node_runs}"
                )
            else:
                logger.debug(f"Cleanup: nothing to delete (retention={retention_days}d)")

            return {
                "deleted_job_runs": deleted_job_runs,
                "deleted_job_logs": deleted_job_logs,
                "deleted_wf_runs": deleted_wf_runs,
                "deleted_node_runs": deleted_node_runs,
            }
        except Exception as exc:
            db.rollback()
            logger.error(f"Cleanup failed: {exc}")
            raise
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

            # Also recover orphaned workflow runs
            wf_orphans = db.query(WorkflowRun).filter(
                WorkflowRun.status.in_(["running", "queued"])
            ).all()

            for wr in wf_orphans:
                wr.status = "failed"
                wr.error_message = "Server restarted while workflow was running"
                wr.finished_at = datetime.now(timezone.utc)
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
