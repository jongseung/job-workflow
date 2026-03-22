"""DataSource service: connection management, schema browsing, and run export."""
import json
import time
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models.datasource import DataSource
from app.utils.encryption import encrypt_value, decrypt_value


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

def list_datasources(db: Session) -> list[DataSource]:
    return db.query(DataSource).order_by(DataSource.name).all()


def get_datasource(db: Session, ds_id: str) -> DataSource:
    ds = db.query(DataSource).filter(DataSource.id == ds_id).first()
    if not ds:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="DataSource not found")
    return ds


def create_datasource(db: Session, data: dict, user_id: str | None = None) -> DataSource:
    password = data.pop("password", None)
    ds = DataSource(
        id=str(uuid.uuid4()),
        created_by=user_id,
        **data,
    )
    if password:
        ds.password_encrypted = encrypt_value(password)
    db.add(ds)
    db.commit()
    db.refresh(ds)
    return ds


def update_datasource(db: Session, ds_id: str, data: dict) -> DataSource:
    ds = get_datasource(db, ds_id)
    password = data.pop("password", None)
    for key, value in data.items():
        if value is not None or key in ("description", "ssl_mode", "host", "username"):
            setattr(ds, key, value)
    if password:
        ds.password_encrypted = encrypt_value(password)
    ds.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(ds)
    return ds


def delete_datasource(db: Session, ds_id: str):
    ds = get_datasource(db, ds_id)
    # Check if any jobs reference this datasource
    from app.models.job import Job
    job_count = db.query(Job).filter(Job.datasource_id == ds_id).count()
    if job_count > 0:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete: {job_count} job(s) reference this datasource"
        )
    db.delete(ds)
    db.commit()


# ---------------------------------------------------------------------------
# Connection helpers
# ---------------------------------------------------------------------------

def _get_password(ds: DataSource) -> str | None:
    if ds.password_encrypted:
        try:
            return decrypt_value(ds.password_encrypted)
        except Exception:
            return None
    return None


def _build_connect_args(db_type: str, host, port, database, username, password, ssl_mode) -> dict:
    """Build keyword args for the appropriate driver connect() call."""
    if db_type == "sqlite":
        return {"database": database}
    if db_type == "postgresql":
        args: dict[str, Any] = {
            "dbname": database,
            "host": host,
            "port": port or 5432,
            "user": username,
            "password": password,
            "connect_timeout": 10,
        }
        if ssl_mode:
            args["sslmode"] = ssl_mode
        return args
    if db_type == "mysql":
        args = {
            "host": host,
            "port": port or 3306,
            "database": database,
            "user": username,
            "password": password,
            "connect_timeout": 10,
        }
        if ssl_mode and ssl_mode != "disable":
            args["ssl"] = {"ssl_mode": ssl_mode}
        return args
    if db_type == "mssql":
        args = {
            "server": host,
            "port": str(port or 1433),
            "database": database,
            "user": username,
            "password": password,
            "login_timeout": 10,
            "tds_version": "7.3",
        }
        if ssl_mode and ssl_mode == "require":
            args["conn_properties"] = "Encrypt=yes;TrustServerCertificate=yes"
        return args
    raise ValueError(f"Unsupported db_type: {db_type}")


def test_connection(
    db_type: str,
    host: str | None,
    port: int | None,
    database: str,
    username: str | None,
    password: str | None,
    ssl_mode: str | None,
) -> dict:
    """Attempt a connection and return {success, message, latency_ms}."""
    t0 = time.perf_counter()
    try:
        conn_args = _build_connect_args(db_type, host, port, database, username, password, ssl_mode)
        if db_type == "sqlite":
            import sqlite3
            conn = sqlite3.connect(**conn_args)
            conn.execute("SELECT 1")
            conn.close()
        elif db_type == "postgresql":
            import psycopg2  # type: ignore
            conn = psycopg2.connect(**conn_args)
            conn.close()
        elif db_type == "mysql":
            import pymysql  # type: ignore
            conn = pymysql.connect(**conn_args)
            conn.close()
        elif db_type == "mssql":
            import pymssql  # type: ignore
            conn = pymssql.connect(**conn_args)
            conn.close()
        latency_ms = int((time.perf_counter() - t0) * 1000)
        return {"success": True, "message": "Connection successful", "latency_ms": latency_ms}
    except Exception as e:
        latency_ms = int((time.perf_counter() - t0) * 1000)
        return {"success": False, "message": str(e), "latency_ms": latency_ms}


def _get_connection(ds: DataSource):
    """Return a live DB connection for the given datasource."""
    pw = _get_password(ds)
    conn_args = _build_connect_args(
        ds.db_type, ds.host, ds.port, ds.database, ds.username, pw, ds.ssl_mode
    )
    if ds.db_type == "sqlite":
        import sqlite3
        return sqlite3.connect(**conn_args), "sqlite3"
    elif ds.db_type == "postgresql":
        import psycopg2  # type: ignore
        return psycopg2.connect(**conn_args), "psycopg2"
    elif ds.db_type == "mysql":
        import pymysql  # type: ignore
        return pymysql.connect(**conn_args), "pymysql"
    elif ds.db_type == "mssql":
        import pymssql  # type: ignore
        return pymssql.connect(**conn_args), "pymssql"
    raise ValueError(f"Unsupported db_type: {ds.db_type}")


# ---------------------------------------------------------------------------
# Schema browsing
# ---------------------------------------------------------------------------

def list_tables(ds: DataSource) -> list[str]:
    conn, driver = _get_connection(ds)
    try:
        cur = conn.cursor()
        if ds.db_type == "sqlite":
            cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        elif ds.db_type == "postgresql":
            cur.execute(
                "SELECT tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY tablename"
            )
        elif ds.db_type == "mysql":
            cur.execute("SHOW TABLES")
        elif ds.db_type == "mssql":
            cur.execute(
                "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES "
                "WHERE TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME"
            )
        rows = cur.fetchall()
        return [r[0] for r in rows]
    finally:
        conn.close()


def get_table_schema(ds: DataSource, table_name: str) -> dict:
    """Return column info + DDL string for the given table."""
    tables = list_tables(ds)
    if table_name not in tables:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found")

    conn, driver = _get_connection(ds)
    try:
        cur = conn.cursor()
        columns = []
        ddl = ""

        if ds.db_type == "sqlite":
            cur.execute(f"PRAGMA table_info(\"{table_name}\")")
            for row in cur.fetchall():
                columns.append({
                    "name": row[1],
                    "type": row[2],
                    "nullable": row[3] == 0,
                    "default": row[4],
                    "primary_key": row[5] == 1,
                })
            cur.execute(
                "SELECT sql FROM sqlite_master WHERE type='table' AND name=?",
                (table_name,)
            )
            row = cur.fetchone()
            ddl = row[0] if row else ""

        elif ds.db_type == "postgresql":
            cur.execute("""
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_name = %s AND table_schema = 'public'
                ORDER BY ordinal_position
            """, (table_name,))
            for row in cur.fetchall():
                columns.append({
                    "name": row[0],
                    "type": row[1],
                    "nullable": row[2] == "YES",
                    "default": row[3],
                    "primary_key": False,
                })
            ddl = _build_pg_ddl(table_name, columns)

        elif ds.db_type == "mysql":
            cur.execute(f"SHOW CREATE TABLE `{table_name}`")
            row = cur.fetchone()
            ddl = row[1] if row else ""
            cur.execute(f"SHOW COLUMNS FROM `{table_name}`")
            for row in cur.fetchall():
                columns.append({
                    "name": row[0],
                    "type": row[1],
                    "nullable": row[2] == "YES",
                    "default": row[4],
                    "primary_key": row[3] == "PRI",
                })

        elif ds.db_type == "mssql":
            cur.execute("""
                SELECT c.COLUMN_NAME, c.DATA_TYPE, c.IS_NULLABLE, c.COLUMN_DEFAULT,
                       CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END AS is_pk
                FROM INFORMATION_SCHEMA.COLUMNS c
                LEFT JOIN (
                    SELECT ku.COLUMN_NAME
                    FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
                    JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
                      ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
                    WHERE tc.TABLE_NAME = %s AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
                ) pk ON c.COLUMN_NAME = pk.COLUMN_NAME
                WHERE c.TABLE_NAME = %s
                ORDER BY c.ORDINAL_POSITION
            """, (table_name, table_name))
            for row in cur.fetchall():
                columns.append({
                    "name": row[0],
                    "type": row[1],
                    "nullable": row[2] == "YES",
                    "default": row[3],
                    "primary_key": bool(row[4]),
                })
            ddl = _build_mssql_ddl(table_name, columns)

        return {"table_name": table_name, "ddl": ddl, "columns": columns}
    finally:
        conn.close()


def _build_pg_ddl(table_name: str, columns: list[dict]) -> str:
    """Reconstruct a CREATE TABLE statement for PostgreSQL from column metadata."""
    lines = []
    for col in columns:
        parts = [f'  "{col["name"]}" {col["type"]}']
        if not col["nullable"]:
            parts.append("NOT NULL")
        if col["default"] is not None:
            parts.append(f"DEFAULT {col['default']}")
        lines.append(" ".join(parts))
    return f'CREATE TABLE "{table_name}" (\n' + ",\n".join(lines) + "\n);"


def _build_mssql_ddl(table_name: str, columns: list[dict]) -> str:
    """Reconstruct a CREATE TABLE statement for MSSQL from column metadata."""
    lines = []
    for col in columns:
        parts = [f"  [{col['name']}] {col['type']}"]
        if not col["nullable"]:
            parts.append("NOT NULL")
        if col["default"] is not None:
            parts.append(f"DEFAULT {col['default']}")
        lines.append(" ".join(parts))
    return f"CREATE TABLE [{table_name}] (\n" + ",\n".join(lines) + "\n);"


def preview_table(ds: DataSource, table_name: str, limit: int = 10) -> dict:
    """Return up to `limit` rows from the table."""
    tables = list_tables(ds)
    if table_name not in tables:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found")

    conn, driver = _get_connection(ds)
    try:
        cur = conn.cursor()
        if ds.db_type == "mysql":
            cur.execute(f"SELECT * FROM `{table_name}` LIMIT %s", (limit,))
        elif ds.db_type == "postgresql":
            cur.execute(f'SELECT * FROM "{table_name}" LIMIT %s', (limit,))
        elif ds.db_type == "mssql":
            cur.execute(f"SELECT TOP %s * FROM [{table_name}]", (limit,))
        else:  # sqlite
            cur.execute(f'SELECT * FROM "{table_name}" LIMIT ?', (limit,))
        col_names = [desc[0] for desc in cur.description] if cur.description else []
        raw_rows = cur.fetchall()
        # Serialize non-JSON-safe types
        rows = []
        for row in raw_rows:
            serialized = []
            for cell in row:
                if isinstance(cell, (bytes, bytearray)):
                    serialized.append(f"<bytes:{len(cell)}>")
                elif hasattr(cell, "isoformat"):
                    serialized.append(cell.isoformat())
                else:
                    serialized.append(cell)
            rows.append(serialized)
        return {"columns": col_names, "rows": rows}
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Run export
# ---------------------------------------------------------------------------

def save_run_results_to_datasource(ds, job, run, logs) -> None:
    """Write job run metadata and logs to two tables in the target datasource.

    Creates tables if they don't exist.
    """
    conn, driver = _get_connection(ds)
    try:
        cur = conn.cursor()
        _ensure_export_tables(cur, ds.db_type)
        conn.commit()

        # Insert run record
        _run_vals = (
            run.id, job.id, job.name, run.status, run.trigger_type,
            run.started_at.isoformat() if run.started_at else None,
            run.finished_at.isoformat() if run.finished_at else None,
            run.duration_ms, run.exit_code, run.error_message,
        )
        _run_cols = "run_id, job_id, job_name, status, trigger_type, started_at, finished_at, duration_ms, exit_code, error_message"
        if ds.db_type == "mysql":
            cur.execute(f"INSERT IGNORE INTO js_job_runs ({_run_cols}) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", _run_vals)
        elif ds.db_type == "postgresql":
            cur.execute(f"INSERT INTO js_job_runs ({_run_cols}) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (run_id) DO NOTHING", _run_vals)
        elif ds.db_type == "mssql":
            cur.execute(f"""
                IF NOT EXISTS (SELECT 1 FROM js_job_runs WHERE run_id=%s)
                INSERT INTO js_job_runs ({_run_cols}) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """, (run.id,) + _run_vals)
        else:  # sqlite
            cur.execute(f"INSERT OR IGNORE INTO js_job_runs ({_run_cols}) VALUES (?,?,?,?,?,?,?,?,?,?)", _run_vals)

        # Insert log lines
        _log_sql_pct = "INSERT INTO js_job_logs (run_id, line_number, stream, level, message, log_timestamp) VALUES (%s,%s,%s,%s,%s,%s)"
        _log_sql_qmark = "INSERT INTO js_job_logs (run_id, line_number, stream, level, message, log_timestamp) VALUES (?,?,?,?,?,?)"
        for log in logs:
            _log_vals = (log.job_run_id, log.line_number, log.stream, log.level, log.message,
                         log.timestamp.isoformat() if log.timestamp else None)
            if ds.db_type in ("mysql", "postgresql", "mssql"):
                cur.execute(_log_sql_pct, _log_vals)
            else:  # sqlite
                cur.execute(_log_sql_qmark, _log_vals)

        conn.commit()
    finally:
        conn.close()


def validate_output_against_table(ds: DataSource, table_name: str, sample_row: dict) -> dict:
    """Validate that sample_row keys match the target table columns.

    Returns {valid: bool, matched: [...], missing: [...], extra: [...], message: str}.
    """
    schema = get_table_schema(ds, table_name)
    table_cols = {c["name"] for c in schema["columns"]}
    row_cols = set(sample_row.keys())

    # Exclude auto-increment / primary-key / default columns (optional to provide)
    required_cols = set()
    optional_cols = set()
    for c in schema["columns"]:
        if c.get("primary_key") and (
            "autoincrement" in str(c.get("default", "")).lower()
            or "serial" in str(c.get("type", "")).lower()
            or c.get("type", "").upper() == "INTEGER"
            and c.get("primary_key")
        ):
            optional_cols.add(c["name"])
        elif c.get("default") is not None or c.get("nullable"):
            optional_cols.add(c["name"])
        else:
            required_cols.add(c["name"])

    matched = row_cols & table_cols
    missing_required = required_cols - row_cols
    extra = row_cols - table_cols

    if missing_required or extra:
        parts = []
        if missing_required:
            parts.append(f"Missing required columns: {sorted(missing_required)}")
        if extra:
            parts.append(f"Unknown columns: {sorted(extra)}")
        return {
            "valid": False,
            "matched": sorted(matched),
            "missing": sorted(missing_required),
            "extra": sorted(extra),
            "table_columns": [{"name": c["name"], "type": c["type"], "nullable": c.get("nullable", True), "primary_key": c.get("primary_key", False)} for c in schema["columns"]],
            "message": ". ".join(parts),
        }

    return {
        "valid": True,
        "matched": sorted(matched),
        "missing": [],
        "extra": [],
        "table_columns": [{"name": c["name"], "type": c["type"], "nullable": c.get("nullable", True), "primary_key": c.get("primary_key", False)} for c in schema["columns"]],
        "message": f"Output matches table schema ({len(matched)} columns matched)",
    }


def insert_rows_to_table(
    ds: DataSource,
    table_name: str,
    rows: list[dict],
    write_mode: str = "append",
    upsert_key: str | None = None,
) -> int:
    """Insert parsed data rows into the target table. Returns count of affected rows.

    write_mode:
        append  — INSERT all rows (default, duplicates may cause errors)
        replace — DELETE all existing rows, then INSERT
        upsert  — INSERT or UPDATE based on upsert_key columns
    """
    if not rows:
        return 0

    conn, driver = _get_connection(ds)
    try:
        cur = conn.cursor()
        
        # Auto-create table if it doesn't exist
        tables = list_tables(ds)
        if table_name not in tables:
            _auto_create_table(cur, ds.db_type, table_name, rows, upsert_key)
            conn.commit()

        columns = list(rows[0].keys())
        affected = 0

        # --- REPLACE mode: truncate first ---
        if write_mode == "replace":
            if ds.db_type == "mysql":
                cur.execute(f"DELETE FROM `{table_name}`")
            elif ds.db_type == "mssql":
                cur.execute(f"DELETE FROM [{table_name}]")
            else:  # sqlite, postgresql
                cur.execute(f'DELETE FROM "{table_name}"')

        # Parse upsert key columns
        key_cols = []
        if write_mode == "upsert" and upsert_key:
            key_cols = [k.strip() for k in upsert_key.split(",") if k.strip()]

        for row in rows:
            values = [row.get(c) for c in columns]

            if write_mode == "upsert" and key_cols:
                _execute_upsert(cur, ds.db_type, table_name, columns, values, key_cols)
            else:
                _execute_insert(cur, ds.db_type, table_name, columns, values)
            affected += 1

        conn.commit()
        return affected
    finally:
        conn.close()


def _auto_create_table(cur, db_type: str, table_name: str, rows: list[dict], upsert_key: str | None):
    if not rows:
        return
        
    first_row = rows[0]
    key_cols = [k.strip() for k in upsert_key.split(",")] if upsert_key else []
    
    col_defs = []
    index_cols = []
    
    def quote(n):
        if db_type == "mysql": return f"`{n}`"
        if db_type == "mssql": return f"[{n}]"
        return f'"{n}"'
        
    for col_name, val in first_row.items():
        sql_type = "TEXT"
        if isinstance(val, bool):
            sql_type = "BOOLEAN" if db_type in ("postgresql", "mysql") else "BIT"
            if db_type == "sqlite": sql_type = "INTEGER"
        elif isinstance(val, int):
            sql_type = "BIGINT" if db_type in ("postgresql", "mysql", "mssql") else "INTEGER"
        elif isinstance(val, float):
            sql_type = "DOUBLE PRECISION" if db_type == "postgresql" else "FLOAT"
        elif isinstance(val, (dict, list)):
            sql_type = "JSONB" if db_type == "postgresql" else "JSON"
            if db_type == "mssql": sql_type = "NVARCHAR(MAX)"
            if db_type == "sqlite": sql_type = "TEXT"
        elif isinstance(val, str):
            if val.count("-") == 2 and ("T" in val or " " in val) and len(val) >= 10:
                sql_type = "TIMESTAMP" if db_type in ("postgresql", "mysql") else "DATETIME"
            else:
                sql_type = "TEXT" if db_type in ("postgresql", "sqlite") else "VARCHAR(MAX)"
                if db_type == "mysql": sql_type = "LONGTEXT"

        col_defs.append(f"{quote(col_name)} {sql_type}")
        
        lname = col_name.lower()
        if (lname.endswith("_id") or lname.endswith("_at") or lname.endswith("_time") or 
            lname.endswith("_date") or lname == "status" or lname == "id"):
            index_cols.append(col_name)
            
    if key_cols:
        quoted_keys = ", ".join([quote(k) for k in key_cols if k in first_row])
        if quoted_keys:
            col_defs.append(f"PRIMARY KEY ({quoted_keys})")
            
    col_str = ",\n  ".join(col_defs)
    create_sql = f"CREATE TABLE {quote(table_name)} (\n  {col_str}\n);"
    
    cur.execute(create_sql)
    
    for col in index_cols:
        if col not in key_cols:
            idx_name = f"idx_{table_name}_{col}"
            try:
                cur.execute(f"CREATE INDEX {quote(idx_name)} ON {quote(table_name)} ({quote(col)})")
            except Exception:
                pass


def _execute_insert(cur, db_type: str, table_name: str, columns: list[str], values: list):
    """Execute a plain INSERT statement."""
    if db_type == "mysql":
        placeholders = ", ".join(["%s"] * len(columns))
        col_str = ", ".join([f"`{c}`" for c in columns])
        cur.execute(f"INSERT INTO `{table_name}` ({col_str}) VALUES ({placeholders})", values)
    elif db_type == "postgresql":
        placeholders = ", ".join(["%s"] * len(columns))
        col_str = ", ".join([f'"{c}"' for c in columns])
        cur.execute(f'INSERT INTO "{table_name}" ({col_str}) VALUES ({placeholders})', values)
    elif db_type == "mssql":
        placeholders = ", ".join(["%s"] * len(columns))
        col_str = ", ".join([f"[{c}]" for c in columns])
        cur.execute(f"INSERT INTO [{table_name}] ({col_str}) VALUES ({placeholders})", values)
    else:  # sqlite
        placeholders = ", ".join(["?"] * len(columns))
        col_str = ", ".join([f'"{c}"' for c in columns])
        cur.execute(f'INSERT INTO "{table_name}" ({col_str}) VALUES ({placeholders})', values)


def _execute_upsert(
    cur, db_type: str, table_name: str,
    columns: list[str], values: list, key_cols: list[str],
):
    """Execute an UPSERT (INSERT ... ON CONFLICT/DUPLICATE KEY UPDATE)."""
    non_key_cols = [c for c in columns if c not in key_cols]

    if db_type == "sqlite":
        placeholders = ", ".join(["?"] * len(columns))
        col_str = ", ".join([f'"{c}"' for c in columns])
        conflict_cols = ", ".join([f'"{c}"' for c in key_cols])
        if non_key_cols:
            update_clause = ", ".join([f'"{c}" = excluded."{c}"' for c in non_key_cols])
            sql = (
                f'INSERT INTO "{table_name}" ({col_str}) VALUES ({placeholders}) '
                f"ON CONFLICT ({conflict_cols}) DO UPDATE SET {update_clause}"
            )
        else:
            sql = (
                f'INSERT INTO "{table_name}" ({col_str}) VALUES ({placeholders}) '
                f"ON CONFLICT ({conflict_cols}) DO NOTHING"
            )
        cur.execute(sql, values)

    elif db_type == "postgresql":
        placeholders = ", ".join(["%s"] * len(columns))
        col_str = ", ".join([f'"{c}"' for c in columns])
        conflict_cols = ", ".join([f'"{c}"' for c in key_cols])
        if non_key_cols:
            update_clause = ", ".join([f'"{c}" = EXCLUDED."{c}"' for c in non_key_cols])
            sql = (
                f'INSERT INTO "{table_name}" ({col_str}) VALUES ({placeholders}) '
                f"ON CONFLICT ({conflict_cols}) DO UPDATE SET {update_clause}"
            )
        else:
            sql = (
                f'INSERT INTO "{table_name}" ({col_str}) VALUES ({placeholders}) '
                f"ON CONFLICT ({conflict_cols}) DO NOTHING"
            )
        cur.execute(sql, values)

    elif db_type == "mysql":
        placeholders = ", ".join(["%s"] * len(columns))
        col_str = ", ".join([f"`{c}`" for c in columns])
        if non_key_cols:
            update_clause = ", ".join([f"`{c}` = VALUES(`{c}`)" for c in non_key_cols])
            sql = (
                f"INSERT INTO `{table_name}` ({col_str}) VALUES ({placeholders}) "
                f"ON DUPLICATE KEY UPDATE {update_clause}"
            )
        else:
            sql = (
                f"INSERT IGNORE INTO `{table_name}` ({col_str}) VALUES ({placeholders})"
            )
        cur.execute(sql, values)

    elif db_type == "mssql":
        # MSSQL uses MERGE for upsert
        placeholders = ", ".join(["%s"] * len(columns))
        col_str = ", ".join([f"[{c}]" for c in columns])
        on_clause = " AND ".join([f"target.[{c}] = source.[{c}]" for c in key_cols])
        source_cols = ", ".join([f"source.[{c}]" for c in columns])
        if non_key_cols:
            update_set = ", ".join([f"target.[{c}] = source.[{c}]" for c in non_key_cols])
            sql = (
                f"MERGE [{table_name}] AS target "
                f"USING (SELECT {', '.join(['%s AS [' + c + ']' for c in columns])}) AS source "
                f"ON {on_clause} "
                f"WHEN MATCHED THEN UPDATE SET {update_set} "
                f"WHEN NOT MATCHED THEN INSERT ({col_str}) VALUES ({source_cols});"
            )
        else:
            sql = (
                f"MERGE [{table_name}] AS target "
                f"USING (SELECT {', '.join(['%s AS [' + c + ']' for c in columns])}) AS source "
                f"ON {on_clause} "
                f"WHEN NOT MATCHED THEN INSERT ({col_str}) VALUES ({source_cols});"
            )
        cur.execute(sql, values)


def _ensure_export_tables(cur, db_type: str):
    """Create js_job_runs and js_job_logs tables if they don't exist."""
    if db_type == "sqlite":
        cur.execute("""
            CREATE TABLE IF NOT EXISTS js_job_runs (
                run_id TEXT PRIMARY KEY,
                job_id TEXT, job_name TEXT, status TEXT,
                trigger_type TEXT, started_at TEXT, finished_at TEXT,
                duration_ms INTEGER, exit_code INTEGER, error_message TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS js_job_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id TEXT, line_number INTEGER, stream TEXT,
                level TEXT, message TEXT, log_timestamp TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)
    elif db_type == "postgresql":
        cur.execute("""
            CREATE TABLE IF NOT EXISTS js_job_runs (
                run_id VARCHAR(36) PRIMARY KEY,
                job_id VARCHAR(36), job_name VARCHAR(200), status VARCHAR(20),
                trigger_type VARCHAR(20), started_at VARCHAR(50), finished_at VARCHAR(50),
                duration_ms INTEGER, exit_code INTEGER, error_message TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS js_job_logs (
                id SERIAL PRIMARY KEY,
                run_id VARCHAR(36), line_number INTEGER, stream VARCHAR(10),
                level VARCHAR(20), message TEXT, log_timestamp VARCHAR(50),
                created_at TIMESTAMP DEFAULT NOW()
            )
        """)
    elif db_type == "mysql":
        cur.execute("""
            CREATE TABLE IF NOT EXISTS js_job_runs (
                run_id VARCHAR(36) PRIMARY KEY,
                job_id VARCHAR(36), job_name VARCHAR(200), status VARCHAR(20),
                trigger_type VARCHAR(20), started_at VARCHAR(50), finished_at VARCHAR(50),
                duration_ms INT, exit_code INT, error_message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS js_job_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                run_id VARCHAR(36), line_number INT, stream VARCHAR(10),
                level VARCHAR(20), message TEXT, log_timestamp VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
    elif db_type == "mssql":
        cur.execute("""
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='js_job_runs' AND xtype='U')
            CREATE TABLE js_job_runs (
                run_id VARCHAR(36) PRIMARY KEY,
                job_id VARCHAR(36), job_name VARCHAR(200), status VARCHAR(20),
                trigger_type VARCHAR(20), started_at VARCHAR(50), finished_at VARCHAR(50),
                duration_ms INT, exit_code INT, error_message NVARCHAR(MAX),
                created_at DATETIME DEFAULT GETDATE()
            )
        """)
        cur.execute("""
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='js_job_logs' AND xtype='U')
            CREATE TABLE js_job_logs (
                id INT IDENTITY(1,1) PRIMARY KEY,
                run_id VARCHAR(36), line_number INT, stream VARCHAR(10),
                level VARCHAR(20), message NVARCHAR(MAX), log_timestamp VARCHAR(50),
                created_at DATETIME DEFAULT GETDATE()
            )
        """)
