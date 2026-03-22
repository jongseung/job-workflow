import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_db, SessionLocal
from app.services.auth_service import create_default_admin
from app.scheduler.engine import start_scheduler, shutdown_scheduler, sync_jobs_from_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_db()

    settings.JOBS_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    settings.VENV_CACHE_DIR.mkdir(parents=True, exist_ok=True)

    # Create default admin user
    db = SessionLocal()
    try:
        create_default_admin(
            db,
            settings.DEFAULT_ADMIN_USERNAME,
            settings.DEFAULT_ADMIN_PASSWORD,
            settings.DEFAULT_ADMIN_EMAIL,
        )
    finally:
        db.close()

    # Recover orphaned runs from previous shutdown
    from app.services.maintenance_service import MaintenanceService
    maint = MaintenanceService()
    await maint.recover_orphaned_runs()

    # Initialize worker pool
    from app.services.worker_pool import init_worker_pool
    init_worker_pool(max_workers=settings.MAX_CONCURRENT_JOBS)

    # Initialize venv manager
    from app.services.venv_manager import init_venv_manager
    init_venv_manager(settings.VENV_CACHE_DIR)

    # Start queue processor
    from app.services.queue_service import get_queue_service
    queue = get_queue_service()
    queue_task = asyncio.create_task(
        queue.start_processor(interval=settings.QUEUE_CHECK_INTERVAL)
    )

    # Start scheduler and sync jobs
    start_scheduler()
    sync_jobs_from_db()

    yield

    # Shutdown
    queue.stop_processor()
    queue_task.cancel()
    shutdown_scheduler()


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
from app.routers import auth, jobs, runs, logs, scheduler, analysis, system, ws, users, audit, datasources, queue

app.include_router(auth.router)
app.include_router(jobs.router)
app.include_router(runs.router)
app.include_router(logs.router)
app.include_router(scheduler.router)
app.include_router(analysis.router)
app.include_router(system.router)
app.include_router(ws.router)
app.include_router(users.router)
app.include_router(audit.router)
app.include_router(datasources.router)
app.include_router(queue.router)
