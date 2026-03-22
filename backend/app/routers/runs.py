from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import desc

from app.database import get_db
from app.models.job_run import JobRun
from app.models.workflow import Workflow, WorkflowRun, WorkflowNodeRun
from app.schemas.job_run import JobRunResponse
from app.core.dependencies import get_current_user
from app.models.user import User

router = APIRouter(tags=["runs"])


@router.get("/api/jobs/{job_id}/runs")
def get_job_runs(
    job_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(JobRun).filter(JobRun.job_id == job_id)
    if status:
        query = query.filter(JobRun.status == status)
    total = query.count()
    runs = query.order_by(desc(JobRun.created_at)).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "items": [JobRunResponse.model_validate(r).model_dump() for r in runs],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/api/jobs/{job_id}/runs/{run_id}", response_model=JobRunResponse)
def get_run_detail(
    job_id: str,
    run_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    run = db.query(JobRun).filter(JobRun.id == run_id, JobRun.job_id == job_id).first()
    if not run:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("Run not found")
    return run


@router.get("/api/runs/recent")
def get_recent_runs(
    limit: int = Query(10, ge=1, le=50),
    run_type: str = Query("all", pattern="^(all|job|workflow)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return recent runs. run_type: all | job | workflow"""
    result = []

    # Job runs
    if run_type in ("all", "job"):
        job_runs = (
            db.query(JobRun)
            .order_by(desc(JobRun.created_at))
            .limit(limit)
            .all()
        )
        for r in job_runs:
            data = JobRunResponse.model_validate(r).model_dump()
            data["job_name"] = r.job.name if r.job else None
            data["run_type"] = "job"
            result.append(data)

    # Workflow runs
    if run_type in ("all", "workflow"):
        wf_runs = (
            db.query(WorkflowRun)
            .options(joinedload(WorkflowRun.workflow))
            .order_by(desc(WorkflowRun.created_at))
            .limit(limit)
            .all()
        )
        for r in wf_runs:
            result.append({
                "id": r.id,
                "run_type": "workflow",
                "workflow_id": r.workflow_id,
                "workflow_name": r.workflow.name if r.workflow else None,
                "status": r.status,
                "trigger_type": r.trigger_type,
                "started_at": r.started_at.isoformat() if r.started_at else None,
                "finished_at": r.finished_at.isoformat() if r.finished_at else None,
                "duration_ms": r.duration_ms,
                "error_message": r.error_message,
                "triggered_by": r.triggered_by,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            })

    # Sort all by created_at descending
    result.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    return result[:limit]


@router.get("/api/runs/workflow/{run_id}/logs")
def get_workflow_run_logs(
    run_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Build synthetic log lines from workflow node runs."""
    wf_run = db.query(WorkflowRun).filter(WorkflowRun.id == run_id).first()
    if not wf_run:
        from app.core.exceptions import NotFoundError
        raise NotFoundError("Workflow run not found")

    node_runs = (
        db.query(WorkflowNodeRun)
        .filter(WorkflowNodeRun.workflow_run_id == run_id)
        .order_by(WorkflowNodeRun.execution_order, WorkflowNodeRun.started_at)
        .all()
    )

    logs = []
    line = 1

    # Run start
    logs.append({
        "id": line,
        "job_run_id": run_id,
        "timestamp": wf_run.started_at.isoformat() if wf_run.started_at else wf_run.created_at.isoformat(),
        "stream": "system",
        "level": "info",
        "message": f"워크플로우 실행 시작 (trigger: {wf_run.trigger_type})",
        "line_number": line,
    })
    line += 1

    for nr in node_runs:
        ts = nr.started_at.isoformat() if nr.started_at else nr.created_at.isoformat()

        if nr.status == "skipped":
            logs.append({
                "id": line,
                "job_run_id": run_id,
                "timestamp": ts,
                "stream": "system",
                "level": "info",
                "message": f"[{nr.node_label or nr.node_id}] 건너뜀 (조건 미충족)",
                "line_number": line,
            })
            line += 1
            continue

        # Node start
        logs.append({
            "id": line,
            "job_run_id": run_id,
            "timestamp": ts,
            "stream": "system",
            "level": "info",
            "message": f"[{nr.node_label or nr.node_id}] 실행 시작 (type: {nr.node_type})",
            "line_number": line,
        })
        line += 1

        # Output data as stdout
        if nr.output_data:
            import json
            output_str = json.dumps(nr.output_data, ensure_ascii=False, default=str)
            # Truncate very long output
            if len(output_str) > 2000:
                output_str = output_str[:2000] + "… (truncated)"
            logs.append({
                "id": line,
                "job_run_id": run_id,
                "timestamp": (nr.finished_at or nr.started_at or nr.created_at).isoformat(),
                "stream": "stdout",
                "level": "info",
                "message": f"[{nr.node_label or nr.node_id}] 출력: {output_str}",
                "line_number": line,
            })
            line += 1

        # Error as stderr
        if nr.error_message:
            logs.append({
                "id": line,
                "job_run_id": run_id,
                "timestamp": (nr.finished_at or nr.started_at or nr.created_at).isoformat(),
                "stream": "stderr",
                "level": "error",
                "message": f"[{nr.node_label or nr.node_id}] 오류: {nr.error_message}",
                "line_number": line,
            })
            line += 1

        # Node end
        end_ts = (nr.finished_at or nr.started_at or nr.created_at).isoformat()
        duration_str = f" ({nr.duration_ms}ms)" if nr.duration_ms else ""
        logs.append({
            "id": line,
            "job_run_id": run_id,
            "timestamp": end_ts,
            "stream": "system",
            "level": "info" if nr.status == "success" else "error",
            "message": f"[{nr.node_label or nr.node_id}] {nr.status}{duration_str}",
            "line_number": line,
        })
        line += 1

    # Run end
    if wf_run.finished_at:
        duration_str = f" ({wf_run.duration_ms}ms)" if wf_run.duration_ms else ""
        logs.append({
            "id": line,
            "job_run_id": run_id,
            "timestamp": wf_run.finished_at.isoformat(),
            "stream": "system",
            "level": "info" if wf_run.status == "success" else "error",
            "message": f"워크플로우 실행 완료: {wf_run.status}{duration_str}",
            "line_number": line,
        })
        line += 1

    return {
        "items": logs,
        "total": len(logs),
        "page": 1,
        "page_size": len(logs),
    }
