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
import sys
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
                run.duration_ms = int((run.finished_at - run.started_at).total_seconds() * 1000)
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
            nd = nodes[nid].get("data", {})
            await _broadcast("workflow_node_update", {
                "workflow_run_id": workflow_run_id,
                "node_id": nid,
                "node_label": nd.get("label", nid),
                "node_type": nd.get("moduleType", "unknown"),
                "status": "skipped",
                "error": "업스트림 노드 실패로 건너뜀",
            })
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

                # Branch filtering: skip this edge if _branch doesn't match
                # When an edge has data.branch set, only follow it if the source
                # node output _branch equals the edge branch value.
                # Non-matching edges are simply blocked (in_degree stays unchanged),
                # which means the downstream node will never reach in_degree=0
                # and therefore will not be queued or executed.
                if branch_cond is not None and isinstance(node_output, dict):
                    actual = str(node_output.get("_branch", "")).lower()
                    if actual != str(branch_cond).lower():
                        continue  # blocked edge — do NOT decrement in_degree

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
    started = datetime.now(timezone.utc)
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
        started_at=started,
    )
    db.add(node_run)
    db.commit()

    await _broadcast("workflow_node_update", {
        "workflow_run_id": workflow_run_id,
        "node_id": node_id,
        "node_label": label,
        "node_type": node_type,
        "status": "running",
    })
    try:
        module = db.query(StepModule).filter(StepModule.id == module_id).first() if module_id else None
        output = await _route_executor(node_type, module, full_input, nd)

        finished = datetime.now(timezone.utc)
        duration_ms = int((finished - started).total_seconds() * 1000)
        output_dict = output if isinstance(output, dict) else {"result": output}

        node_run.status = "success"
        node_run.output_data = _json_safe(output_dict)
        node_run.finished_at = finished
        node_run.duration_ms = duration_ms
        db.commit()

        # Build a brief output summary for the log (avoid huge payloads)
        output_summary = _summarize_output(output_dict)

        broadcast_data: dict = {
            "workflow_run_id": workflow_run_id,
            "node_id": node_id,
            "node_label": label,
            "node_type": node_type,
            "status": "success",
            "duration_ms": duration_ms,
            "output_summary": output_summary,
        }
        # For HTML nodes, include the rendered HTML so frontend can preview it
        if isinstance(output_dict, dict) and "html" in output_dict:
            broadcast_data["output_html"] = output_dict["html"]
        await _broadcast("workflow_node_update", broadcast_data)
        return output_dict

    except Exception as exc:
        db.rollback()  # Clear any pending rollback state
        finished = datetime.now(timezone.utc)
        duration_ms = int((finished - started).total_seconds() * 1000)
        node_run = db.merge(node_run)
        node_run.status = "failed"
        node_run.error_message = str(exc)[:2000]
        node_run.finished_at = finished
        node_run.duration_ms = duration_ms
        db.commit()

        await _broadcast("workflow_node_update", {
            "workflow_run_id": workflow_run_id,
            "node_id": node_id,
            "node_label": label,
            "node_type": node_type,
            "status": "failed",
            "duration_ms": duration_ms,
            "error": str(exc)[:500],
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
        # node config 'code' takes priority over module.executor_code
        node_cfg = node_data.get("config") or {}
        code = node_cfg.get("code") or (module.executor_code if module else None) or ""
        if code:
            result = await _run_python_code(code, input_data)
            await _maybe_save_output(node_cfg, result)
            return result
        return input_data

    if not module:
        raise ValueError(f"Node '{node_type}' has no module configured")

    if module.executor_type == "python":
        return await _run_python(module, input_data, node_data)
    if module.executor_type == "http":
        return await _run_http(module, input_data, node_data)
    if module.executor_type == "sql":
        return await _run_sql(module, input_data, node_data)
    if module.executor_type == "html":
        return _run_html(module, input_data, node_data)
    if module.executor_type == "builtin":
        return _run_builtin(module, input_data)

    raise ValueError(f"Unknown executor type: {module.executor_type}")


async def _run_python_code(code: str, input_data: dict) -> dict:
    """Subprocess Python executor (low-level). Input via stdin, output via __OUTPUT__: line."""
    wrapper = (
        "import json as __json, sys as __sys\n"
        "input_data = __json.loads(__sys.stdin.read() or '{}')\n"
        "result = None\n"
        "# ── user code ──\n"
        f"{code}\n"
        "# ── auto-output ──\n"
        "if result is not None:\n"
        "    print('__OUTPUT__:' + __json.dumps(result, default=str, ensure_ascii=False))\n"
    )

    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".py", prefix="wf_node_")
    try:
        os.write(tmp_fd, wrapper.encode())
        os.close(tmp_fd)

        from app.services.subprocess_compat import run_subprocess

        _, stdout, stderr, returncode = await run_subprocess(
            sys.executable, "-u", tmp_path,
            stdin_data=json.dumps(input_data).encode(),
            timeout=300,
        )
        if returncode != 0:
            err_msg = stderr.decode("utf-8", errors="replace")[:500] if stderr else "Unknown error"
            if returncode == -1:
                raise RuntimeError(f"Python executor timed out after 300s")
            raise RuntimeError(f"Python executor error: {err_msg}")

        # Parse __OUTPUT__: line
        out_text = stdout.decode("utf-8", errors="replace") if stdout else ""
        for line in out_text.splitlines():
            if line.startswith("__OUTPUT__:"):
                try:
                    return json.loads(line[len("__OUTPUT__:"):])
                except json.JSONDecodeError:
                    pass
        # Fallback: try parse all stdout as JSON
        raw = out_text.strip()
        if raw:
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                pass
        return {"stdout": raw}
    finally:
        # Windows may hold file handles briefly after process exit; retry deletion
        for _attempt in range(3):
            try:
                os.unlink(tmp_path)
                break
            except PermissionError:
                import time
                time.sleep(0.2)
            except OSError:
                break


async def _run_python(module: StepModule, input_data: dict, node_data: dict) -> dict:
    """Python executor: node config 'code' takes priority over module.executor_code."""
    node_cfg = node_data.get("config") or {}
    code = node_cfg.get("code") or (module.executor_code if module else "") or ""
    if not code:
        raise ValueError("Python 노드에 실행할 코드가 없습니다")
    result = await _run_python_code(code, input_data)
    await _maybe_save_output(node_cfg, result)
    return result


async def _run_http(module: StepModule, input_data: dict, node_data: dict) -> dict:
    """HTTP executor: node config (url/method/headers/body_template) takes priority over module config."""
    node_cfg = node_data.get("config") or {}
    mod_cfg = (module.executor_config or {}) if module else {}

    url = node_cfg.get("url") or mod_cfg.get("url", "")
    method = (node_cfg.get("method") or mod_cfg.get("method", "POST")).upper()
    # Merge headers: module defaults, then node overrides
    headers = {**(mod_cfg.get("headers") or {}), **(node_cfg.get("headers") or {})}

    # body_template from node (JSON object) or fall back to input_data
    body_raw = node_cfg.get("body_template")
    if isinstance(body_raw, str):
        try:
            body = json.loads(body_raw)
        except (json.JSONDecodeError, TypeError):
            body = input_data
    elif isinstance(body_raw, dict):
        body = body_raw
    else:
        body = input_data

    if not url:
        raise ValueError("HTTP 노드에 URL이 설정되지 않았습니다")

    # Template substitution in URL using input_data
    for k, v in input_data.items():
        url = url.replace(f"{{{k}}}", str(v))

    # SSL verification: use config setting (supports corporate/Windows environments)
    from app.config import settings as _settings
    ssl_verify = _settings.HTTP_SSL_VERIFY

    try:
        import httpx
        async with httpx.AsyncClient(timeout=30, verify=ssl_verify) as client:
            if method in ("POST", "PUT", "PATCH"):
                resp = await client.request(method, url, json=body, headers=headers)
            else:
                resp = await client.request(method, url, params=input_data, headers=headers)

            try:
                result = resp.json()
            except Exception:
                result = {"status": resp.status_code, "body": resp.text}
    except ImportError:
        import urllib.request, ssl
        if ssl_verify:
            try:
                import certifi as _certifi
                _ssl_ctx = ssl.create_default_context(cafile=_certifi.where())
            except ImportError:
                _ssl_ctx = ssl.create_default_context()
        else:
            _ssl_ctx = ssl.create_default_context()
            _ssl_ctx.check_hostname = False
            _ssl_ctx.verify_mode = ssl.CERT_NONE
        payload = json.dumps(body).encode()
        req = urllib.request.Request(url, payload, {**headers, "Content-Type": "application/json"})
        req.get_method = lambda: method
        with urllib.request.urlopen(req, context=_ssl_ctx, timeout=30) as r:
            body_resp = r.read().decode()
            try:
                result = json.loads(body_resp)
            except json.JSONDecodeError:
                result = {"status": r.status, "body": body_resp}

    await _maybe_save_output(node_cfg, result if isinstance(result, list) else [result])
    return result if isinstance(result, dict) else {"result": result}


def _serialize_cell(cell):
    """Convert DB cell values to JSON-safe types."""
    if cell is None:
        return None
    if hasattr(cell, "isoformat"):  # datetime, date, time
        return cell.isoformat()
    from decimal import Decimal
    if isinstance(cell, Decimal):
        return int(cell) if cell == int(cell) else float(cell)
    if isinstance(cell, bytes):
        return cell.decode("utf-8", errors="replace")
    return cell


def _json_safe(obj):
    """Recursively convert non-JSON-serializable types."""
    from decimal import Decimal
    if obj is None or isinstance(obj, (bool, int, float, str)):
        return obj
    if isinstance(obj, dict):
        return {k: _json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_json_safe(v) for v in obj]
    if hasattr(obj, "isoformat"):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return int(obj) if obj == int(obj) else float(obj)
    if isinstance(obj, bytes):
        return obj.decode("utf-8", errors="replace")
    return str(obj)


async def _run_sql(module: StepModule, input_data: dict, node_data: dict) -> dict:
    """SQL executor: node config (datasource_id/query) takes priority over module config."""
    node_cfg = node_data.get("config") or {}
    mod_cfg = (module.executor_config or {}) if module else {}

    datasource_id = node_cfg.get("datasource_id") or mod_cfg.get("datasource_id")
    query = node_cfg.get("query") or (module.executor_code if module else None) or mod_cfg.get("query", "")

    if not datasource_id:
        raise ValueError("SQL 노드에 데이터소스가 설정되지 않았습니다. 노드 설정에서 데이터소스를 선택해주세요.")
    if not query:
        raise ValueError("SQL 노드에 쿼리가 없습니다. 노드 설정에서 SQL 쿼리를 입력해주세요.")

    from app.services.datasource_service import _get_connection
    from app.models.datasource import DataSource

    db = SessionLocal()
    try:
        ds = db.query(DataSource).filter(DataSource.id == datasource_id).first()
        if not ds:
            raise ValueError(f"데이터소스를 찾을 수 없습니다: {datasource_id}")
        conn, _ = _get_connection(ds)
        try:
            cur = conn.cursor()
            # Template substitution: replace {key} placeholders with input_data values
            for k, v in input_data.items():
                query = query.replace(f"{{{k}}}", str(v) if v is not None else "NULL")
            cur.execute(query)
            col_names = [d[0] for d in (cur.description or [])]
            rows = [
                {c: _serialize_cell(cell) for c, cell in zip(col_names, row)}
                for row in cur.fetchall()
            ]
            result = {"rows": rows, "count": len(rows), "columns": col_names}
            # Output saving
            if rows:
                await _maybe_save_output(node_cfg, rows)
            return result
        finally:
            conn.close()
    finally:
        db.close()


async def _maybe_save_output(node_cfg: dict, data: Any) -> None:
    """Save node output to a datasource table if 'save_output' is configured."""
    if not node_cfg.get("save_output"):
        return
    datasource_id = node_cfg.get("output_datasource_id")
    table = node_cfg.get("output_table", "workflow_output")
    write_mode = node_cfg.get("output_write_mode", "append")

    upsert_key = node_cfg.get("output_upsert_key") or None

    if not datasource_id or not table:
        return

    try:
        from app.services.datasource_service import insert_rows_to_table
        from app.models.datasource import DataSource

        rows: list[dict] = []
        if isinstance(data, list):
            rows = [r if isinstance(r, dict) else {"value": r} for r in data]
        elif isinstance(data, dict):
            rows = [data]
        else:
            rows = [{"value": data}]

        if not rows:
            return

        db = SessionLocal()
        try:
            ds = db.query(DataSource).filter(DataSource.id == datasource_id).first()
            if ds:
                insert_rows_to_table(
                    ds, table, rows,
                    write_mode=write_mode,
                    upsert_key=upsert_key if write_mode == "upsert" else None,
                )
        finally:
            db.close()
    except Exception as exc:
        # Don't fail the node execution if output saving fails — just log
        import logging
        logging.getLogger(__name__).warning(f"Output save failed: {exc}")


def _run_html(module: StepModule | None, input_data: dict, node_data: dict) -> dict:
    """HTML Report executor: render Jinja2 template with input_data → HTML string."""
    from jinja2 import Environment, BaseLoader, select_autoescape

    cfg = node_data.get("config") or {}
    template_str = cfg.get("template") or (module.executor_code if module else None) or ""
    title = cfg.get("title") or "Report"

    if not template_str.strip():
        raise ValueError("HTML 노드에 템플릿이 없습니다. 설정에서 HTML 템플릿을 입력해주세요.")

    env = Environment(
        loader=BaseLoader(),
        autoescape=select_autoescape(default_for_string=False),
    )

    # Add useful filters
    def fmt_number(value, decimals=0):
        try:
            return f"{float(value):,.{int(decimals)}f}"
        except (ValueError, TypeError):
            return str(value)

    def fmt_percent(value, decimals=1):
        try:
            return f"{float(value):.{int(decimals)}f}%"
        except (ValueError, TypeError):
            return str(value)

    env.filters["number"] = fmt_number
    env.filters["percent"] = fmt_percent

    try:
        tmpl = env.from_string(template_str)
        html = tmpl.render(data=input_data, **input_data)
    except Exception as exc:
        raise ValueError(f"HTML 템플릿 렌더링 실패: {exc}")

    return {
        "html": html,
        "title": title,
        "template_length": len(template_str),
        "rendered_length": len(html),
    }


def _run_condition(module: StepModule | None, input_data: dict, node_data: dict) -> dict:
    cfg = node_data.get("config") or {}
    condition = cfg.get("expression") or cfg.get("condition", "True")
    try:
        result = bool(eval(condition, {"__builtins__": {}}, {"input_data": input_data, **input_data}))  # noqa: S307
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


def _summarize_output(output: dict) -> str:
    """Return a short human-readable summary of a node output dict."""
    if not output:
        return ""
    # Prefer high-level summary fields
    for key in ("message", "summary", "status", "total", "count"):
        if key in output:
            return f"{key}={output[key]}"
    # For row arrays
    if "rows" in output and isinstance(output["rows"], list):
        return f"{len(output['rows'])}행 반환"
    if "result" in output and isinstance(output["result"], list):
        return f"{len(output['result'])}개 항목"
    # Fallback: first key-value pair
    try:
        first_key = next(k for k in output if not k.startswith("_"))
        val = output[first_key]
        val_str = str(val)[:60] if not isinstance(val, (dict, list)) else f"({type(val).__name__})"
        return f"{first_key}={val_str}"
    except StopIteration:
        return ""


async def _broadcast(event_type: str, data: dict):
    try:
        await manager.broadcast_event({
            "type": event_type,
            "data": {**data, "timestamp": datetime.now(timezone.utc).isoformat()},
        })
    except Exception:
        pass
