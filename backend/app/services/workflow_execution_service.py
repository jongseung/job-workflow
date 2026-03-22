"""
Workflow DAG Execution Engine
─────────────────────────────
Parses canvas_data (nodes + edges) into a DAG, executes nodes with topological
ordering (parallel within each level), and propagates outputs via ExecutionContext.
"""
from __future__ import annotations

import asyncio
import json
import os
import tempfile
import uuid
from collections import defaultdict, deque
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.module import StepModule
from app.models.workflow import WorkflowRun, WorkflowNodeRun
from app.websocket.manager import manager


# ─── Execution Context ────────────────────────────────────────────────────────

class ExecutionContext:
    """Carries all state during one workflow run."""

    def __init__(self, initial_data: dict = None):
        self._outputs: dict[str, Any] = {}
        self._errors: dict[str, str] = {}
        self._initial = initial_data or {}

    def set_output(self, node_id: str, data: Any):
        self._outputs[node_id] = data if isinstance(data, dict) else {"result": data}

    def get_output(self, node_id: str) -> dict:
        return self._outputs.get(node_id, {})

    def set_error(self, node_id: str, error: str):
        self._errors[node_id] = error

    def has_error(self, node_id: str) -> bool:
        return node_id in self._errors

    def resolve_input(self, input_mapping: dict) -> dict:
        """Resolve inputMapping dict → actual values from prior nodes."""
        resolved = {}
        for field, mapping in (input_mapping or {}).items():
            if not isinstance(mapping, dict):
                resolved[field] = mapping
                continue

            mtype = mapping.get("type", "static")
            if mtype == "node_output":
                node_id = mapping.get("nodeId", "")
                path = mapping.get("path", "")
                resolved[field] = _extract_path(self._outputs.get(node_id, {}), path)
            elif mtype == "initial":
                resolved[field] = _extract_path(self._initial, mapping.get("path", ""))
            else:  # static
                resolved[field] = mapping.get("value")
        return resolved


def _extract_path(data: Any, path: str) -> Any:
    """Dot-notation path extractor. E.g. 'users[0].name'"""
    if not path or data is None:
        return data
    parts = path.replace("[", ".").replace("]", "").split(".")
    current = data
    for part in parts:
        if not part:
            continue
        try:
            if isinstance(current, dict):
                current = current[part]
            elif isinstance(current, list):
                current = current[int(part)]
            else:
                return None
        except (KeyError, IndexError, ValueError, TypeError):
            return None
    return current


# ─── Main Entry Point ─────────────────────────────────────────────────────────

async def run_workflow(
    workflow_run_id: str,
    canvas_data: dict,
    initial_context: dict | None = None,
):
    db = SessionLocal()
    try:
        run = db.query(WorkflowRun).filter(WorkflowRun.id == workflow_run_id).first()
        if not run:
            return

        run.status = "running"
        run.started_at = datetime.now(timezone.utc)
        db.commit()

        await _broadcast("workflow_run_update", {
            "workflow_run_id": workflow_run_id, "status": "running"
        })

        final_status = "success"
        try:
            await _execute_dag(db, workflow_run_id, canvas_data, initial_context or {})
            # Check if any node failed
            failed = db.query(WorkflowNodeRun).filter(
                WorkflowNodeRun.workflow_run_id == workflow_run_id,
                WorkflowNodeRun.status == "failed",
            ).count()
            if failed:
                final_status = "failed"
        except Exception as exc:
            final_status = "failed"
            run = db.query(WorkflowRun).filter(WorkflowRun.id == workflow_run_id).first()
            if run:
                run.error_message = str(exc)

        run = db.query(WorkflowRun).filter(WorkflowRun.id == workflow_run_id).first()
        if run:
            run.status = final_status
            run.finished_at = datetime.now(timezone.utc)
            if run.started_at:
                sa = run.started_at if run.started_at.tzinfo else run.started_at.replace(tzinfo=timezone.utc)
                run.duration_ms = int((run.finished_at - sa).total_seconds() * 1000)
            db.commit()

        await _broadcast("workflow_run_update", {
            "workflow_run_id": workflow_run_id, "status": final_status
        })
    finally:
        db.close()


# ─── DAG Executor ─────────────────────────────────────────────────────────────

async def _execute_dag(
    db: Session,
    workflow_run_id: str,
    canvas_data: dict,
    initial_context: dict,
):
    nodes: dict[str, dict] = {n["id"]: n for n in canvas_data.get("nodes", [])}
    edges: list[dict] = canvas_data.get("edges", [])

    if not nodes:
        return

    # Build graph
    successors: dict[str, list[dict]] = defaultdict(list)
    predecessors: dict[str, list[str]] = defaultdict(list)

    for edge in edges:
        src, tgt = edge["source"], edge["target"]
        successors[src].append(edge)
        predecessors[tgt].append(src)

    in_degree = {nid: len(predecessors[nid]) for nid in nodes}
    queue: deque[str] = deque(nid for nid, d in in_degree.items() if d == 0)

    context = ExecutionContext(initial_context)
    completed: set[str] = set()
    execution_order = 0

    while queue:
        current_level = list(queue)
        queue.clear()

        # Separate runnable from skipped
        runnable, skipped = [], []
        for nid in current_level:
            if any(context.has_error(p) for p in predecessors[nid]):
                skipped.append(nid)
            else:
                runnable.append(nid)

        # Mark skipped nodes
        for nid in skipped:
            _save_node_run(db, workflow_run_id, nid, nodes[nid], "skipped",
                           execution_order, None, None, "Upstream node failed")
            context.set_error(nid, "Skipped due to upstream failure")
            execution_order += 1
            completed.add(nid)

        # Run this level in parallel
        if runnable:
            tasks = [
                _execute_node(db, workflow_run_id, nid, nodes[nid], context, execution_order + i)
                for i, nid in enumerate(runnable)
            ]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            execution_order += len(runnable)

            for nid, result in zip(runnable, results):
                completed.add(nid)
                if isinstance(result, Exception):
                    context.set_error(nid, str(result))
                else:
                    context.set_output(nid, result)

        # Advance in-degrees
        for nid in current_level:
            node_output = context.get_output(nid)
            for edge in successors[nid]:
                tgt = edge["target"]
                branch_cond = (edge.get("data") or {}).get("branch")

                # Condition node branch filtering
                if branch_cond is not None and isinstance(node_output, dict):
                    actual = str(node_output.get("_branch", "")).lower()
                    if actual != str(branch_cond).lower():
                        in_degree[tgt] -= 1
                        if in_degree[tgt] == 0 and tgt not in completed:
                            queue.append(tgt)
                        continue

                in_degree[tgt] -= 1
                if in_degree[tgt] == 0 and tgt not in completed:
                    queue.append(tgt)


async def _execute_node(
    db: Session,
    workflow_run_id: str,
    node_id: str,
    node: dict,
    context: ExecutionContext,
    execution_order: int,
) -> dict:
    nd = node.get("data", {})
    module_id: str | None = nd.get("moduleId")
    node_type: str = nd.get("moduleType", node.get("type", "unknown"))
    label: str = nd.get("label", node_id)

    resolved_input = context.resolve_input(nd.get("inputMapping", {}))
    config = nd.get("config", {})
    full_input = {**config, **resolved_input}

    # Create running record
    node_run = WorkflowNodeRun(
        id=str(uuid.uuid4()),
        workflow_run_id=workflow_run_id,
        node_id=node_id,
        module_id=module_id,
        node_type=node_type,
        node_label=label,
        status="running",
        input_data=full_input,
        execution_order=execution_order,
        started_at=datetime.now(timezone.utc),
    )
    db.add(node_run)
    db.commit()

    await _broadcast("workflow_node_update", {
        "workflow_run_id": workflow_run_id,
        "node_id": node_id,
        "status": "running",
    })

    started = datetime.now(timezone.utc)
    try:
        module = db.query(StepModule).filter(StepModule.id == module_id).first() if module_id else None
        output = await _route_executor(node_type, module, full_input, nd)

        finished = datetime.now(timezone.utc)
        duration_ms = int((finished - started).total_seconds() * 1000)
        output_dict = output if isinstance(output, dict) else {"result": output}

        node_run.status = "success"
        node_run.output_data = output_dict
        node_run.finished_at = finished
        node_run.duration_ms = duration_ms
        db.commit()

        await _broadcast("workflow_node_update", {
            "workflow_run_id": workflow_run_id,
            "node_id": node_id,
            "status": "success",
            "output": output_dict,
        })
        return output_dict

    except Exception as exc:
        finished = datetime.now(timezone.utc)
        node_run.status = "failed"
        node_run.error_message = str(exc)
        node_run.finished_at = finished
        node_run.duration_ms = int((finished - started).total_seconds() * 1000)
        db.commit()

        await _broadcast("workflow_node_update", {
            "workflow_run_id": workflow_run_id,
            "node_id": node_id,
            "status": "failed",
            "error": str(exc),
        })
        raise


# ─── Executors ────────────────────────────────────────────────────────────────

async def _route_executor(
    node_type: str,
    module: StepModule | None,
    input_data: dict,
    node_data: dict,
) -> dict:
    if node_type == "trigger":
        return input_data

    if node_type == "merge":
        return input_data

    if node_type == "condition":
        return _run_condition(module, input_data, node_data)

    if node_type == "transform":
        if module and module.executor_code:
            return await _run_python(module.executor_code, input_data)
        return input_data

    if not module:
        raise ValueError(f"Node '{node_type}' has no module configured")

    if module.executor_type == "python":
        return await _run_python(module.executor_code or "", input_data)
    if module.executor_type == "http":
        return await _run_http(module, input_data)
    if module.executor_type == "sql":
        return await _run_sql(module, input_data)
    if module.executor_type == "builtin":
        return _run_builtin(module, input_data)

    raise ValueError(f"Unknown executor type: {module.executor_type}")


async def _run_python(code: str, input_data: dict) -> dict:
    """Subprocess Python executor. Input via stdin, output via __OUTPUT__: line."""
    wrapper = (
        "import json as __json, sys as __sys\n"
        "input_data = __json.loads(__sys.stdin.read() or '{}')\n"
        "# ── user code ──\n"
        f"{code}\n"
    )

    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".py", prefix="wf_node_")
    try:
        os.write(tmp_fd, wrapper.encode())
        os.close(tmp_fd)
        proc = await asyncio.create_subprocess_exec(
            "python3", "-u", tmp_path,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(input=json.dumps(input_data).encode()),
            timeout=300,
        )
        if proc.returncode != 0:
            raise RuntimeError(f"Python executor error: {stderr.decode()[:500]}")

        # Parse __OUTPUT__: line
        for line in stdout.decode().splitlines():
            if line.startswith("__OUTPUT__:"):
                try:
                    return json.loads(line[len("__OUTPUT__:"):])
                except json.JSONDecodeError:
                    pass
        # Fallback: try parse all stdout as JSON
        raw = stdout.decode().strip()
        if raw:
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                pass
        return {"stdout": stdout.decode().strip()}
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


async def _run_http(module: StepModule, input_data: dict) -> dict:
    cfg = module.executor_config or {}
    url = cfg.get("url", "")
    method = cfg.get("method", "POST").upper()
    headers = cfg.get("headers", {})

    # Template substitution in URL
    for k, v in input_data.items():
        url = url.replace(f"{{{k}}}", str(v))

    try:
        import httpx
        async with httpx.AsyncClient(timeout=30) as client:
            if method in ("POST", "PUT", "PATCH"):
                resp = await client.request(method, url, json=input_data, headers=headers)
            else:
                resp = await client.request(method, url, params=input_data, headers=headers)

            try:
                return resp.json()
            except Exception:
                return {"status": resp.status_code, "body": resp.text}
    except ImportError:
        # Fallback: urllib
        import urllib.request
        payload = json.dumps(input_data).encode()
        req = urllib.request.Request(url, payload, {**headers, "Content-Type": "application/json"})
        req.get_method = lambda: method
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read().decode()
            try:
                return json.loads(body)
            except json.JSONDecodeError:
                return {"status": r.status, "body": body}


async def _run_sql(module: StepModule, input_data: dict) -> dict:
    cfg = module.executor_config or {}
    datasource_id = cfg.get("datasource_id")
    query = module.executor_code or cfg.get("query", "")

    if not datasource_id:
        raise ValueError("SQL executor requires datasource_id")
    if not query:
        raise ValueError("SQL executor requires a query")

    from app.services.datasource_service import _get_connection
    from app.models.datasource import DataSource

    db = SessionLocal()
    try:
        ds = db.query(DataSource).filter(DataSource.id == datasource_id).first()
        if not ds:
            raise ValueError(f"Datasource {datasource_id} not found")
        conn, _ = _get_connection(ds)
        try:
            cur = conn.cursor()
            params = list(input_data.values()) if input_data else []
            cur.execute(query, params)
            col_names = [d[0] for d in (cur.description or [])]
            rows = [
                {c: (cell.isoformat() if hasattr(cell, "isoformat") else cell)
                 for c, cell in zip(col_names, row)}
                for row in cur.fetchall()
            ]
            return {"rows": rows, "count": len(rows), "columns": col_names}
        finally:
            conn.close()
    finally:
        db.close()


def _run_condition(module: StepModule | None, input_data: dict, node_data: dict) -> dict:
    condition = (node_data.get("config") or {}).get("condition", "True")
    try:
        result = bool(eval(condition, {"__builtins__": {}}, input_data))  # noqa: S307
        return {"_branch": "true" if result else "false", **input_data}
    except Exception as exc:
        return {"_branch": "false", "_error": str(exc), **input_data}


def _run_builtin(module: StepModule, input_data: dict) -> dict:
    btype = (module.executor_config or {}).get("builtin_type", "passthrough")
    if btype == "passthrough":
        return input_data
    return input_data


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _save_node_run(
    db: Session, workflow_run_id: str, node_id: str, node: dict,
    status: str, order: int,
    input_data: dict | None, output_data: dict | None, error: str | None,
):
    nd = node.get("data", {})
    nr = WorkflowNodeRun(
        id=str(uuid.uuid4()),
        workflow_run_id=workflow_run_id,
        node_id=node_id,
        module_id=nd.get("moduleId"),
        node_type=nd.get("moduleType", "unknown"),
        node_label=nd.get("label", node_id),
        status=status,
        input_data=input_data,
        output_data=output_data,
        error_message=error,
        execution_order=order,
    )
    db.add(nr)
    db.commit()


async def _broadcast(event_type: str, data: dict):
    try:
        await manager.broadcast_event({
            "type": event_type,
            "data": {**data, "timestamp": datetime.now(timezone.utc).isoformat()},
        })
    except Exception:
        pass
