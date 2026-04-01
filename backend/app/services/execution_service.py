import asyncio
import csv
import io
import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from app.config import settings
from app.models.job import Job
from app.models.job_run import JobRun
from app.models.job_log import JobLog
from app.database import SessionLocal

# Prefix that marks a stdout line as a data row for target-table insertion
DATA_LINE_PREFIX = "__DATA__:"


def _parse_data_line(payload: str, output_format: str) -> dict | None:
    """Parse a single data-line payload into a dict.

    Supports 'jsonl' (one JSON object per line) and 'csv' (header on first call is
    handled externally; here each line is treated as JSON).
    """
    payload = payload.strip()
    if not payload:
        return None
    try:
        if output_format == "csv":
            # CSV lines are also sent as JSON objects for simplicity
            # (the code template instructs users to use json.dumps)
            return json.loads(payload)
        else:  # jsonl (default)
            obj = json.loads(payload)
            if isinstance(obj, dict):
                return obj
            return None
    except (json.JSONDecodeError, ValueError):
        return None


def _ensure_utc(dt: datetime | None) -> datetime | None:
    """Ensure datetime is timezone-aware (UTC). SQLite returns naive datetimes."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


# Global dict to track running processes for cancellation
_running_processes: dict[str, subprocess.Popen] = {}


async def run_job(
    job_id: str, run_id: str, code: str, timeout: int, env_vars: dict | None = None,
    python_path: str | None = None,
):
    if python_path is None:
        python_path = sys.executable
    """Execute a Python job in a subprocess with real-time streaming output.

    Key design: DB writes are synchronous on the event loop thread (safe for
    SQLAlchemy sessions, fast for SQLite WAL ~1-5ms per commit). The only
    actual async operations are stream.readline() and WebSocket broadcast.
    This avoids thread-safety issues that arise from run_in_executor + shared session.
    """
    db = SessionLocal()
    try:
        run = db.query(JobRun).filter(JobRun.id == run_id).first()
        if not run:
            return
        run.status = "running"
        run.started_at = datetime.now(timezone.utc)
        db.commit()

        # Fetch job config for data output parsing
        job_obj = db.query(Job).filter(Job.id == job_id).first()
        output_format = getattr(job_obj, "output_format", "jsonl") or "jsonl"
        target_table = getattr(job_obj, "target_table", None)

        # Write code to a system temp file (avoids triggering uvicorn --reload watchdog)
        tmp_fd, tmp_path = tempfile.mkstemp(suffix=".py", prefix=f"job_{run_id}_")
        code_file = Path(tmp_path)
        try:
            os.write(tmp_fd, code.encode())
        finally:
            os.close(tmp_fd)

        # Build environment (preserve critical Windows system vars)
        env = os.environ.copy()
        if env_vars:
            if sys.platform == "win32":
                # Protect vars required for Windows subprocess to function
                _protected = {"SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP"}
                env_vars = {k: v for k, v in env_vars.items() if k.upper() not in _protected}
            env.update(env_vars)
        # Ensure subprocess uses UTF-8 output (critical for non-ASCII on Windows)
        env.setdefault("PYTHONIOENCODING", "utf-8")
        # Suppress urllib3 InsecureRequestWarning when verify=False is used
        # (requests library outputs noisy warnings on every HTTPS call)
        if not settings.HTTP_SSL_VERIFY:
            existing = env.get("PYTHONWARNINGS", "")
            suppress = "ignore::urllib3.exceptions.InsecureRequestWarning"
            if suppress not in existing:
                env["PYTHONWARNINGS"] = f"{existing},{suppress}" if existing else suppress

        from app.websocket.manager import manager

        # Shared counter — incremented only on event loop thread, no concurrency issue
        line_counter = [0]

        def _write_log(stream: str, level: str, message: str) -> int:
            """Write one log line to DB (synchronous, event-loop thread only)."""
            line_counter[0] += 1
            ln = line_counter[0]
            db.add(JobLog(
                job_run_id=run_id,
                stream=stream,
                level=level,
                message=message,
                line_number=ln,
            ))
            db.commit()
            return ln

        async def _emit(stream: str, level: str, message: str):
            """Write to DB (sync) then broadcast via WebSocket (async)."""
            ln = _write_log(stream, level, message)
            try:
                await manager.broadcast(run_id, {
                    "type": "log",
                    "data": {
                        "stream": stream,
                        "level": level,
                        "message": message,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "line_number": ln,
                    },
                })
            except Exception:
                pass

        # Collect data rows for target-table insertion
        data_rows: list[dict] = []
        # Track last stderr lines for better error messages on failure
        last_stderr_lines: list[str] = []

        async def _on_stdout(line: str):
            """Process a single stdout line."""
            if line.startswith(DATA_LINE_PREFIX):
                payload = line[len(DATA_LINE_PREFIX):]
                parsed = _parse_data_line(payload, output_format)
                if parsed is not None:
                    data_rows.append(parsed)
                    await _emit("stdout", "debug", f"[DATA] {payload[:200]}")
                else:
                    await _emit("stdout", "warning", f"[DATA PARSE ERROR] {payload[:200]}")
            else:
                await _emit("stdout", "info", line)

        async def _on_stderr(line: str):
            last_stderr_lines.append(line)
            if len(last_stderr_lines) > 10:
                last_stderr_lines.pop(0)
            await _emit("stderr", "error", line)

        await _emit("system", "info", "Starting job execution...")

        timed_out = False
        exit_code = -1

        try:
            from app.services.subprocess_compat import StreamingProcess

            sp = StreamingProcess(
                python_path, "-u", str(code_file),
                env=env,
                cwd=tempfile.gettempdir(),
            )
            sp.start()
            _running_processes[run_id] = sp.process

            try:
                await sp.read_streams(_on_stdout, _on_stderr, timeout=timeout)
            except asyncio.TimeoutError:
                timed_out = True

            exit_code = sp.returncode if sp.returncode is not None else -1
            finished_at = datetime.now(timezone.utc)

            if timed_out:
                await _emit("system", "error", f"Job timed out after {timeout}s")

            # Re-fetch run to avoid stale state
            run = db.query(JobRun).filter(JobRun.id == run_id).first()
            started_at = _ensure_utc(run.started_at) or finished_at
            duration_ms = int((finished_at - started_at).total_seconds() * 1000)

            run.exit_code = exit_code
            run.finished_at = finished_at
            run.duration_ms = duration_ms

            if timed_out:
                run.status = "failed"
                run.error_message = f"Job timed out after {timeout}s"
            elif exit_code == 0:
                run.status = "success"
                await _emit("system", "info", f"Job completed successfully in {duration_ms}ms")
            else:
                run.status = "failed"
                # Include last stderr context for more useful error reporting
                stderr_tail = "\n".join(last_stderr_lines[-5:]) if last_stderr_lines else ""
                err_detail = f"Process exited with code {exit_code}"
                if stderr_tail:
                    err_detail += f"\n{stderr_tail}"
                run.error_message = err_detail[:2000]
                await _emit("system", "error", f"Job failed with exit code {exit_code}")
                if stderr_tail:
                    await _emit("system", "error", f"Last stderr: {stderr_tail[:500]}")

                # Handle retry
                job = db.query(Job).filter(Job.id == job_id).first()
                if job and run.attempt_number < job.max_retries:
                    run.status = "retrying"
                    await _emit(
                        "system", "info",
                        f"Scheduling retry {run.attempt_number + 1}/{job.max_retries}"
                    )
                    asyncio.get_running_loop().call_later(
                        job.retry_delay_seconds,
                        lambda: asyncio.ensure_future(
                            _create_retry_run(
                                job_id, run.attempt_number + 1, code, timeout, env_vars
                            )
                        ),
                    )

            db.commit()

            # Optionally persist run/data to external datasource
            await _maybe_save_to_datasource(db, job_id, run_id, run, line_counter, data_rows)

            # Broadcast completion event to all event listeners
            try:
                await manager.broadcast_event({
                    "type": "job_status_changed",
                    "data": {
                        "job_id": job_id,
                        "run_id": run_id,
                        "status": run.status,
                        "exit_code": exit_code,
                    },
                })
            except Exception:
                pass

            # Send webhook notification if configured
            try:
                webhook_url = getattr(job, "notify_webhook_url", None)
                notify_on = getattr(job, "notify_on", "failure") or "failure"
                if webhook_url:
                    from app.services.notification_service import should_notify, send_webhook_notification
                    if should_notify(notify_on, run.status):
                        await asyncio.get_running_loop().run_in_executor(
                            None,
                            lambda: send_webhook_notification(
                                webhook_url=webhook_url,
                                job_name=job.name,
                                job_id=job_id,
                                run_id=run_id,
                                status=run.status,
                                exit_code=exit_code,
                                duration_ms=run.duration_ms,
                                error_message=run.error_message,
                            ),
                        )
            except Exception:
                pass

            # DAG: trigger dependent jobs
            try:
                from app.services.dag_service import get_dag_service
                dag = get_dag_service()
                dag.on_job_completed(db, job_id, run.status)
            except Exception:
                pass

        except Exception as e:
            run = db.query(JobRun).filter(JobRun.id == run_id).first()
            if run:
                run.status = "failed"
                run.error_message = str(e)
                run.finished_at = datetime.now(timezone.utc)
                started_at = _ensure_utc(run.started_at)
                if started_at:
                    run.duration_ms = int(
                        (run.finished_at - started_at).total_seconds() * 1000
                    )
                _write_log("system", "error", f"Execution error: {e}")
                db.commit()
        finally:
            _running_processes.pop(run_id, None)
            # Windows holds file handles longer after process exit; retry with backoff
            _retries = 8 if sys.platform == "win32" else 3
            for _attempt in range(_retries):
                try:
                    code_file.unlink(missing_ok=True)
                    break
                except PermissionError:
                    import time
                    time.sleep(0.3 * (_attempt + 1))  # 0.3, 0.6, 0.9 ...
                except Exception:
                    break
    finally:
        db.close()


async def _maybe_save_to_datasource(
    db, job_id: str, run_id: str, run, line_counter: list, data_rows: list[dict]
):
    """Persist run results and/or parsed data rows to configured external datasource."""
    try:
        job_obj = db.query(Job).filter(Job.id == job_id).first()
        if not (job_obj and job_obj.datasource_id):
            return

        from app.models.datasource import DataSource
        ds = db.query(DataSource).filter(DataSource.id == job_obj.datasource_id).first()
        if not ds:
            return

        save_logs = getattr(job_obj, "save_to_datasource", False)
        target_table = getattr(job_obj, "target_table", None)

        # 1) Save run logs to js_job_runs / js_job_logs (legacy behavior)
        if save_logs:
            logs_for_export = db.query(JobLog).filter(JobLog.job_run_id == run_id).all()

            def _do_save_logs():
                from app.services.datasource_service import save_run_results_to_datasource
                save_run_results_to_datasource(ds, job_obj, run, logs_for_export)

            await asyncio.get_running_loop().run_in_executor(None, _do_save_logs)

            line_counter[0] += 1
            db.add(JobLog(
                job_run_id=run_id, stream="system", level="info",
                message="Run logs saved to datasource", line_number=line_counter[0],
            ))
            db.commit()

        # 2) Insert parsed data rows into the target table
        if target_table and data_rows:
            write_mode = getattr(job_obj, "write_mode", "append") or "append"
            upsert_key = getattr(job_obj, "upsert_key", None)

            def _do_insert():
                from app.services.datasource_service import insert_rows_to_table
                return insert_rows_to_table(ds, target_table, data_rows, write_mode, upsert_key)

            inserted = await asyncio.get_running_loop().run_in_executor(None, _do_insert)

            mode_label = {"append": "Inserted", "replace": "Replaced", "upsert": "Upserted"}.get(write_mode, "Inserted")
            line_counter[0] += 1
            db.add(JobLog(
                job_run_id=run_id, stream="system", level="info",
                message=f"{mode_label} {inserted} data rows into '{target_table}' (mode={write_mode})",
                line_number=line_counter[0],
            ))
            db.commit()
        elif target_table and not data_rows:
            line_counter[0] += 1
            db.add(JobLog(
                job_run_id=run_id, stream="system", level="warning",
                message=f"No __DATA__ rows found for target table '{target_table}'. "
                        f"Use print('__DATA__:' + json.dumps(row)) in your code.",
                line_number=line_counter[0],
            ))
            db.commit()

    except Exception as e:
        try:
            line_counter[0] += 1
            db.add(JobLog(
                job_run_id=run_id, stream="system", level="warning",
                message=f"Failed to save to datasource: {e}",
                line_number=line_counter[0],
            ))
            db.commit()
        except Exception:
            pass


async def cancel_run(run_id: str) -> bool:
    """Cancel a running job by terminating its subprocess."""
    process = _running_processes.get(run_id)
    if process and process.returncode is None:
        process.terminate()
        try:
            loop = asyncio.get_running_loop()
            await asyncio.wait_for(
                loop.run_in_executor(None, process.wait), timeout=5
            )
        except asyncio.TimeoutError:
            process.kill()
        return True
    return False


async def _create_retry_run(
    job_id: str, attempt: int, code: str, timeout: int, env_vars: dict | None
):
    db = SessionLocal()
    try:
        run = JobRun(
            job_id=job_id,
            status="pending",
            trigger_type="retry",
            attempt_number=attempt,
        )
        db.add(run)
        db.commit()
        db.refresh(run)
        await run_job(job_id, run.id, code, timeout, env_vars)
    finally:
        db.close()


def _add_log(
    db: Session, run_id: str, line_number: int, stream: str, level: str, message: str
):
    """Add a log entry and commit immediately (used by external callers)."""
    log = JobLog(
        job_run_id=run_id,
        stream=stream,
        level=level,
        message=message,
        line_number=line_number,
    )
    db.add(log)
    db.commit()
