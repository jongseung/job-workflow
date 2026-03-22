"""DataSource router: CRUD, connection testing, and schema browsing."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from app.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.models.user import User
from app.services import datasource_service as svc

router = APIRouter(prefix="/api/datasources", tags=["datasources"])


# ---------------------------------------------------------------------------
# Schemas (inline to avoid extra file)
# ---------------------------------------------------------------------------

class DataSourceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    db_type: str = Field(..., pattern="^(postgresql|mysql|mssql|sqlite)$")
    host: str | None = None
    port: int | None = Field(default=None, ge=1, le=65535)
    database: str = Field(..., min_length=1)
    username: str | None = None
    password: str | None = None
    ssl_mode: str | None = None


class DataSourceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = None
    db_type: str | None = Field(default=None, pattern="^(postgresql|mysql|mssql|sqlite)$")
    host: str | None = None
    port: int | None = Field(default=None, ge=1, le=65535)
    database: str | None = None
    username: str | None = None
    password: str | None = None  # None = keep existing
    ssl_mode: str | None = None
    is_active: bool | None = None


class ConnectionTestRequest(BaseModel):
    db_type: str = Field(..., pattern="^(postgresql|mysql|mssql|sqlite)$")
    host: str | None = None
    port: int | None = None
    database: str
    username: str | None = None
    password: str | None = None
    ssl_mode: str | None = None


def _ds_to_dict(ds) -> dict:
    return {
        "id": ds.id,
        "name": ds.name,
        "description": ds.description,
        "db_type": ds.db_type,
        "host": ds.host,
        "port": ds.port,
        "database": ds.database,
        "username": ds.username,
        "ssl_mode": ds.ssl_mode,
        "is_active": ds.is_active,
        "created_by": ds.created_by,
        "created_at": ds.created_at.isoformat(),
        "updated_at": ds.updated_at.isoformat() if ds.updated_at else None,
    }


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("")
def list_datasources(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items = svc.list_datasources(db)
    return [_ds_to_dict(ds) for ds in items]


@router.post("", status_code=201)
def create_datasource(
    data: DataSourceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "operator")),
):
    payload = data.model_dump()
    ds = svc.create_datasource(db, payload, user_id=current_user.id)
    return _ds_to_dict(ds)


@router.get("/{ds_id}")
def get_datasource(
    ds_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ds = svc.get_datasource(db, ds_id)
    return _ds_to_dict(ds)


@router.put("/{ds_id}")
def update_datasource(
    ds_id: str,
    data: DataSourceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "operator")),
):
    payload = {k: v for k, v in data.model_dump().items() if v is not None}
    ds = svc.update_datasource(db, ds_id, payload)
    return _ds_to_dict(ds)


@router.delete("/{ds_id}", status_code=204)
def delete_datasource(
    ds_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    svc.delete_datasource(db, ds_id)


# ---------------------------------------------------------------------------
# Connection testing (stateless)
# ---------------------------------------------------------------------------

@router.post("/test")
def test_connection(
    data: ConnectionTestRequest,
    current_user: User = Depends(require_role("admin", "operator")),
):
    result = svc.test_connection(
        db_type=data.db_type,
        host=data.host,
        port=data.port,
        database=data.database,
        username=data.username,
        password=data.password,
        ssl_mode=data.ssl_mode,
    )
    return result


@router.post("/{ds_id}/test")
def test_saved_datasource(
    ds_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ds = svc.get_datasource(db, ds_id)
    from app.utils.encryption import decrypt_value
    pw = None
    if ds.password_encrypted:
        try:
            pw = decrypt_value(ds.password_encrypted)
        except Exception:
            pass
    result = svc.test_connection(
        db_type=ds.db_type,
        host=ds.host,
        port=ds.port,
        database=ds.database,
        username=ds.username,
        password=pw,
        ssl_mode=ds.ssl_mode,
    )
    return result


# ---------------------------------------------------------------------------
# Schema browsing
# ---------------------------------------------------------------------------

@router.get("/{ds_id}/tables")
def list_tables(
    ds_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ds = svc.get_datasource(db, ds_id)
    try:
        tables = svc.list_tables(ds)
        return {"tables": tables}
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{ds_id}/tables/{table_name}/schema")
def get_table_schema(
    ds_id: str,
    table_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ds = svc.get_datasource(db, ds_id)
    try:
        return svc.get_table_schema(ds, table_name)
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=str(e))


class ValidateOutputRequest(BaseModel):
    sample_row: dict


@router.post("/{ds_id}/tables/{table_name}/validate")
def validate_output(
    ds_id: str,
    table_name: str,
    data: ValidateOutputRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ds = svc.get_datasource(db, ds_id)
    try:
        return svc.validate_output_against_table(ds, table_name, data.sample_row)
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{ds_id}/tables/{table_name}/preview")
def preview_table(
    ds_id: str,
    table_name: str,
    limit: int = Query(default=10, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ds = svc.get_datasource(db, ds_id)
    try:
        return svc.preview_table(ds, table_name, limit=limit)
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=str(e))
