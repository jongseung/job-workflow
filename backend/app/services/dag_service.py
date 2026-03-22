"""
DAG Service: Job dependency management.

- Validates DAG on job create/update (cycle detection via DFS)
- On job completion, checks if dependent jobs should trigger
- depends_on is JSON array of job IDs on Job model
"""

import json
import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.job import Job
from app.models.job_run import JobRun

logger = logging.getLogger(__name__)


class DAGService:

    def validate_dependencies(self, db: Session, job_id: str, depends_on: list[str]) -> dict:
        """Validate no cycle. Returns {"valid": True} or {"valid": False, "error": "..."}."""
        if not depends_on:
            return {"valid": True}

        # Check all referenced jobs exist
        existing_ids = {
            row[0] for row in db.query(Job.id).filter(Job.id.in_(depends_on)).all()
        }
        missing = set(depends_on) - existing_ids
        if missing:
            return {"valid": False, "error": f"Jobs not found: {', '.join(missing)}"}

        if job_id in depends_on:
            return {"valid": False, "error": "Job cannot depend on itself"}

        # Build adjacency list
        all_jobs = db.query(Job.id, Job.depends_on).all()
        graph: dict[str, list[str]] = {}
        for jid, deps in all_jobs:
            if jid == job_id:
                graph[jid] = depends_on
            elif deps:
                try:
                    graph[jid] = json.loads(deps)
                except (json.JSONDecodeError, TypeError):
                    graph[jid] = []
            else:
                graph[jid] = []

        # DFS cycle detection (3-color)
        WHITE, GRAY, BLACK = 0, 1, 2
        color = {jid: WHITE for jid in graph}
        path: list[str] = []

        def dfs(node: str) -> str | None:
            color[node] = GRAY
            path.append(node)
            for neighbor in graph.get(node, []):
                if neighbor not in color:
                    continue
                if color[neighbor] == GRAY:
                    cycle_start = path.index(neighbor)
                    cycle = path[cycle_start:] + [neighbor]
                    return " -> ".join(cycle)
                if color[neighbor] == WHITE:
                    result = dfs(neighbor)
                    if result:
                        return result
            color[node] = BLACK
            path.pop()
            return None

        for node in graph:
            if color.get(node) == WHITE:
                cycle = dfs(node)
                if cycle:
                    return {"valid": False, "error": f"Cycle detected: {cycle}"}

        return {"valid": True}

    def on_job_completed(self, db: Session, job_id: str, status: str):
        """Called after job run completes. Triggers dependent jobs if applicable."""
        from app.services.queue_service import get_queue_service

        # Find dependent jobs
        all_jobs = db.query(Job).filter(Job.depends_on.isnot(None)).all()
        dependents = []
        for job in all_jobs:
            try:
                deps = json.loads(job.depends_on) if job.depends_on else []
            except (json.JSONDecodeError, TypeError):
                deps = []
            if job_id in deps:
                dependents.append((job, deps))

        if not dependents:
            return

        queue = get_queue_service()

        for dep_job, deps in dependents:
            if not dep_job.is_active:
                continue

            all_parents_success = True
            any_parent_failed = False

            for parent_id in deps:
                latest_run = (
                    db.query(JobRun)
                    .filter(JobRun.job_id == parent_id)
                    .order_by(JobRun.created_at.desc())
                    .first()
                )
                if not latest_run or latest_run.status != "success":
                    all_parents_success = False
                if latest_run and latest_run.status == "failed":
                    any_parent_failed = True

            if all_parents_success:
                logger.info(f"DAG: All parents success for '{dep_job.name}', enqueueing")
                queue.enqueue(db, dep_job.id, trigger_type="dependency")
            elif any_parent_failed:
                skipped_run = JobRun(
                    job_id=dep_job.id,
                    status="skipped",
                    trigger_type="dependency",
                    error_message=f"Parent job {job_id} failed",
                )
                db.add(skipped_run)
                db.commit()
                logger.info(f"DAG: Skipped '{dep_job.name}' (parent failed)")

    def get_dependencies(self, db: Session, job_id: str) -> dict:
        """Get upstream and downstream dependencies for a job."""
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            return {"upstream": [], "downstream": []}

        # Upstream: jobs this job depends on
        upstream = []
        try:
            depends_on = json.loads(job.depends_on) if job.depends_on else []
        except (json.JSONDecodeError, TypeError):
            depends_on = []

        for dep_id in depends_on:
            dep_job = db.query(Job).filter(Job.id == dep_id).first()
            if dep_job:
                latest_run = (
                    db.query(JobRun)
                    .filter(JobRun.job_id == dep_id)
                    .order_by(JobRun.created_at.desc())
                    .first()
                )
                upstream.append({
                    "id": dep_job.id,
                    "name": dep_job.name,
                    "last_status": latest_run.status if latest_run else None,
                })

        # Downstream: jobs that depend on this job
        downstream = []
        all_jobs = db.query(Job).filter(Job.depends_on.isnot(None)).all()
        for other_job in all_jobs:
            try:
                deps = json.loads(other_job.depends_on) if other_job.depends_on else []
            except (json.JSONDecodeError, TypeError):
                deps = []
            if job_id in deps:
                latest_run = (
                    db.query(JobRun)
                    .filter(JobRun.job_id == other_job.id)
                    .order_by(JobRun.created_at.desc())
                    .first()
                )
                downstream.append({
                    "id": other_job.id,
                    "name": other_job.name,
                    "last_status": latest_run.status if latest_run else None,
                })

        return {"upstream": upstream, "downstream": downstream}


# Singleton
_dag_service: DAGService | None = None


def get_dag_service() -> DAGService:
    global _dag_service
    if _dag_service is None:
        _dag_service = DAGService()
    return _dag_service
