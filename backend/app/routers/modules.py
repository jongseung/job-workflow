from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.dependencies import get_current_user, require_admin
from app.models.user import User
from app.schemas.module import ModuleCreate, ModuleUpdate, ModuleOut, ModuleTestRequest
from app.services import module_service

router = APIRouter(prefix="/api/modules", tags=["modules"])


@router.get("", response_model=list[ModuleOut])
def list_modules(
    active_only: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return module_service.list_modules(db, active_only=active_only)


@router.get("/{module_id}", response_model=ModuleOut)
def get_module(
    module_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return module_service.get_module(db, module_id)


@router.post("", response_model=ModuleOut, status_code=201)
def create_module(
    payload: ModuleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    return module_service.create_module(db, payload.model_dump(exclude_none=True), user_id=current_user.id)


@router.put("/{module_id}", response_model=ModuleOut)
def update_module(
    module_id: str,
    payload: ModuleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    return module_service.update_module(db, module_id, payload.model_dump(exclude_none=True))


@router.delete("/{module_id}", status_code=204)
def delete_module(
    module_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    module_service.delete_module(db, module_id)


@router.post("/{module_id}/test")
async def test_module(
    module_id: str,
    payload: ModuleTestRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Run a module with test input data and return the output."""
    from app.services.workflow_execution_service import _route_executor
    m = module_service.get_module(db, module_id)
    try:
        output = await _route_executor(m.module_type, m, payload.input_data, {})
        return {"success": True, "output": output}
    except Exception as exc:
        return {"success": False, "error": str(exc)}
