from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.models.user import User

router = APIRouter(prefix="/api/queue", tags=["queue"])


@router.get("/status")
async def get_queue_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.services.queue_service import get_queue_service
    from app.services.worker_pool import get_worker_pool

    queue = get_queue_service()
    pool = get_worker_pool()

    queued_runs = queue.get_queued_runs(db)
    queued_count = queue.get_queued_count(db)
    stats = await pool.get_stats(queued_count=queued_count)

    return {
        "queued_runs": queued_runs,
        "active_workers": stats.active_workers,
        "max_workers": stats.max_workers,
        "queued_count": stats.queued_count,
        "lock_status": stats.lock_status,
    }


@router.get("/venv-stats")
async def get_venv_stats(
    current_user: User = Depends(require_role("admin")),
):
    from app.services.venv_manager import get_venv_manager
    mgr = get_venv_manager()
    return mgr.get_cache_stats()
