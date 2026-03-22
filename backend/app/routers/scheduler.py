from fastapi import APIRouter, Depends

from app.scheduler.engine import get_scheduler, get_scheduler_status
from app.core.dependencies import get_current_user, require_role
from app.models.user import User
from app.schemas.common import MessageResponse

router = APIRouter(prefix="/api/scheduler", tags=["scheduler"])


@router.get("/status")
def scheduler_status(current_user: User = Depends(get_current_user)):
    return get_scheduler_status()


@router.post("/pause", response_model=MessageResponse)
def pause_scheduler(current_user: User = Depends(require_role("admin"))):
    s = get_scheduler()
    s.pause()
    return MessageResponse(message="Scheduler paused")


@router.post("/resume", response_model=MessageResponse)
def resume_scheduler(current_user: User = Depends(require_role("admin"))):
    s = get_scheduler()
    s.resume()
    return MessageResponse(message="Scheduler resumed")
