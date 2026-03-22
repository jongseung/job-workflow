# Concurrent Job Execution Design Document

> **Summary**: Worker Pool, venv Manager, DAG 의존성, Priority Queue를 통한 프로덕션급 동시 실행 시스템 상세 설계
>
> **Project**: Job Scheduler
> **Version**: 1.1.0
> **Author**: jongsports
> **Date**: 2026-03-21
> **Status**: Draft
> **Planning Doc**: [concurrent-execution.plan.md](../../01-plan/features/concurrent-execution.plan.md)

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 단일 프로세스 순차 실행, 동시성 제어 없음, pip 패키지 사용 불가, Job 간 의존성 관리 불가 |
| **Solution** | asyncio.Semaphore 기반 Worker Pool + hash 기반 공유 venv 캐시 + in-memory Lock + DB Queue + DAG 자동 트리거 |
| **Function/UX Effect** | 스크래핑/BigQuery/ETL Job 동시 실행, 패키지 자동 설치 및 캐시 재사용, 의존 Job 자동 체이닝, 실시간 큐 모니터링 |
| **Core Value** | 단일 스케줄러에서 기업급 데이터 파이프라인 오케스트레이터로 진화 |

---

## 1. Overview

### 1.1 Design Goals

1. **동시 실행**: 최대 N개(기본 5) Job이 병렬로 안전하게 실행
2. **패키지 격리**: Job별 requirements를 독립 venv에서 실행, hash 기반 캐시로 디스크 효율화
3. **동시성 제어**: 같은 Job의 중복 실행 방지 (max_concurrent per job)
4. **의존성 관리**: Job 간 DAG 설정으로 선행 Job 완료 시 자동 트리거
5. **우선순위 큐**: Worker 슬롯 부족 시 priority 기반 대기열 처리
6. **운영 편의**: 이력 자동 정리, Job 복제, 일괄 작업, Import/Export

### 1.2 Design Principles

- **Zero New Infrastructure**: Redis/RabbitMQ 없이 asyncio + SQLite/DB만으로 구현
- **Backward Compatible**: 기존 Job은 변경 없이 동작 (requirements 없으면 시스템 Python 사용)
- **Fail-Safe**: Worker 장애가 다른 Job에 전파되지 않음, Semaphore always released
- **Incremental Adoption**: Phase별 독립 배포 가능

---

## 2. Architecture

### 2.1 Component Diagram

```
┌───────────────────────────────────────────────────────────────┐
│                      Scheduler Engine                          │
│                  (APScheduler + Queue Processor)                │
│                                                                │
│  Triggers:  [Cron] [Interval] [Manual] [DAG Auto-Trigger]     │
│                          │                                     │
│                          ▼                                     │
│  ┌─────────────────────────────────────────┐                  │
│  │            Queue Service                 │                  │
│  │  DB-based: job_runs.status = 'queued'    │                  │
│  │  Sorted by: priority ASC, queued_at ASC  │                  │
│  └──────────────────┬──────────────────────┘                  │
│                     ▼                                          │
│  ┌─────────────────────────────────────────┐                  │
│  │           Worker Pool                    │                  │
│  │   asyncio.Semaphore(MAX_CONCURRENT_JOBS) │                  │
│  │                                          │                  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐│                  │
│  │  │ Worker 1 │ │ Worker 2 │ │ Worker 3 ││                  │
│  │  │(venv-abc)│ │(venv-def)│ │(_default)││                  │
│  │  └──────────┘ └──────────┘ └──────────┘│                  │
│  └──────────────────┬──────────────────────┘                  │
│                     │                                          │
│  ┌──────────────────┴──────────────────────┐                  │
│  │  Lock Manager     │  venv Manager        │                  │
│  │  per-job           │  hash-based cache    │                  │
│  │  asyncio.Lock      │  pip install         │                  │
│  └─────────────────────────────────────────┘                  │
│                     │                                          │
│                     ▼                                          │
│  ┌─────────────────────────────────────────┐                  │
│  │           DAG Service                    │                  │
│  │  On job completion → check dependents    │                  │
│  │  → auto-enqueue if all parents success   │                  │
│  └─────────────────────────────────────────┘                  │
│                                                                │
│  ┌─────────────────────────────────────────┐                  │
│  │       Maintenance Service                │                  │
│  │  - History retention (cron daily)        │                  │
│  │  - Stale venv cleanup (cron weekly)      │                  │
│  │  - Orphaned run recovery (startup)       │                  │
│  └─────────────────────────────────────────┘                  │
└───────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow

```
Job Trigger (cron/manual/dag)
  → Queue Service: create JobRun(status='queued', queued_at=now)
  → Queue Processor (5s interval): pick highest priority queued run
  → Lock Manager: check per-job concurrency (max_concurrent)
    → Blocked? → skip, stay queued
    → Allowed? → acquire lock
  → Worker Pool: semaphore.acquire()
    → Full? → skip, stay queued
    → Available? → proceed
  → venv Manager: ensure_venv(requirements)
    → Cache hit? → use existing venv
    → Cache miss? → create venv + pip install
  → Subprocess execution (venv python)
  → On completion:
    → Release semaphore + lock
    → DAG Service: trigger dependent jobs
    → Webhook notification (if configured)
```

### 2.3 Dependencies

| Component | Depends On | Purpose |
|-----------|-----------|---------|
| Queue Service | DB (job_runs table) | Persistent queue storage |
| Worker Pool | asyncio.Semaphore | Concurrency limiting |
| Lock Manager | asyncio (in-memory dict) | Per-job concurrency control |
| venv Manager | File system, pip | Package isolation |
| DAG Service | Job model (depends_on) | Dependency resolution |
| Maintenance Service | DB, File system | Cleanup operations |
| Queue Processor | Queue Service, Worker Pool, Lock Manager | Orchestration |

---

## 3. Data Model

### 3.1 Job Model Changes

```python
# models/job.py — NEW COLUMNS
class Job(Base):
    # ... existing fields ...

    # Phase 1: Concurrent Execution
    requirements: Mapped[str | None] = mapped_column(Text, nullable=True)
    # pip format, one package per line. e.g.: "requests==2.31.0\nbeautifulsoup4\n"

    max_concurrent: Mapped[int] = mapped_column(Integer, default=1)
    # 1 = no duplicate runs, 0 = unlimited, N = max N parallel runs of this job

    # Phase 2: DAG
    depends_on: Mapped[str | None] = mapped_column(Text, nullable=True)
    # JSON array of job IDs: '["uuid-1", "uuid-2"]'
    # ALL listed jobs must succeed before this job auto-triggers

    @property
    def depends_on_list(self) -> list[str]:
        if self.depends_on:
            return json.loads(self.depends_on)
        return []

    @property
    def requirements_hash(self) -> str | None:
        """SHA256 hash of normalized requirements for venv cache key."""
        if not self.requirements or not self.requirements.strip():
            return None
        import hashlib
        normalized = "\n".join(
            sorted(line.strip().lower() for line in self.requirements.strip().splitlines() if line.strip())
        )
        return hashlib.sha256(normalized.encode()).hexdigest()[:16]
```

### 3.2 JobRun Model Changes

```python
# models/job_run.py — NEW COLUMNS + STATUS
class JobRun(Base):
    # ... existing fields ...

    # NEW: status enum extended with 'queued' and 'skipped'
    status: Mapped[str] = mapped_column(
        SAEnum("pending", "queued", "running", "success", "failed",
               "cancelled", "retrying", "skipped", name="run_status"),
        nullable=False, default="pending",
    )

    # NEW: trigger_type extended with 'dependency'
    trigger_type: Mapped[str] = mapped_column(
        SAEnum("scheduled", "manual", "retry", "dependency", name="trigger_type"),
        nullable=False, default="manual",
    )

    queued_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Timestamp when the run entered the queue

    worker_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    # UUID of the worker slot that executed this run
```

### 3.3 SystemConfig Table (NEW)

```python
# models/system_config.py — NEW
class SystemConfig(Base):
    __tablename__ = "system_config"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
```

Initial values:
| Key | Default | Description |
|-----|---------|-------------|
| `MAX_CONCURRENT_JOBS` | `5` | Worker pool size |
| `RETENTION_DAYS` | `30` | Run history retention |
| `QUEUE_CHECK_INTERVAL` | `5` | Queue processor interval (seconds) |
| `VENV_MAX_AGE_DAYS` | `30` | Unused venv cleanup threshold |

### 3.4 Database Schema Changes (SQL)

```sql
-- Phase 1: Job table
ALTER TABLE jobs ADD COLUMN requirements TEXT;
ALTER TABLE jobs ADD COLUMN max_concurrent INTEGER DEFAULT 1;

-- Phase 2: Job table (DAG)
ALTER TABLE jobs ADD COLUMN depends_on TEXT;  -- JSON: ["job_id_1", ...]

-- Phase 1: JobRun table
ALTER TABLE job_runs ADD COLUMN queued_at TIMESTAMP;
ALTER TABLE job_runs ADD COLUMN worker_id VARCHAR(36);
-- Note: 'queued' and 'skipped' status values, 'dependency' trigger_type
-- handled by SQLAlchemy enum migration

-- Phase 1: System config table (NEW)
CREATE TABLE IF NOT EXISTS system_config (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO system_config (key, value) VALUES ('MAX_CONCURRENT_JOBS', '5');
INSERT OR IGNORE INTO system_config (key, value) VALUES ('RETENTION_DAYS', '30');
INSERT OR IGNORE INTO system_config (key, value) VALUES ('QUEUE_CHECK_INTERVAL', '5');
INSERT OR IGNORE INTO system_config (key, value) VALUES ('VENV_MAX_AGE_DAYS', '30');
```

### 3.5 Schema (Pydantic) Changes

```python
# schemas/job.py — additions
class JobBase(BaseModel):
    # ... existing fields ...
    requirements: str | None = None  # pip format, multiline
    max_concurrent: int = Field(default=1, ge=0, le=20)
    depends_on: list[str] | None = None  # list of job UUIDs

class JobUpdate(BaseModel):
    # ... existing fields ...
    requirements: str | None = None
    max_concurrent: int | None = Field(default=None, ge=0, le=20)
    depends_on: list[str] | None = None

class JobResponse(BaseModel):
    # ... existing fields ...
    requirements: str | None = None
    max_concurrent: int = 1
    depends_on: list[str] | None = None

class JobRunResponse(BaseModel):
    # ... existing fields ...
    queued_at: datetime | None = None
    worker_id: str | None = None
```

### 3.6 Frontend Type Changes

```typescript
// types/api.ts — additions
export interface Job {
  // ... existing fields ...
  requirements: string | null;
  max_concurrent: number;
  depends_on: string[] | null;
}

export interface JobRun {
  // ... existing fields ...
  status: 'pending' | 'queued' | 'running' | 'success' | 'failed'
        | 'cancelled' | 'retrying' | 'skipped';
  trigger_type: 'scheduled' | 'manual' | 'retry' | 'dependency';
  queued_at: string | null;
  worker_id: string | null;
}

export interface SystemStats {
  // ... existing fields ...
  queued_jobs: number;
  max_concurrent_jobs: number;
  active_workers: number;
  venv_cache_count: number;
  venv_cache_size_bytes: number;
}

// NEW
export interface QueueStatus {
  queued_runs: QueuedRun[];
  active_workers: number;
  max_workers: number;
  lock_status: Record<string, number>;  // job_id → running count
}

export interface QueuedRun {
  run_id: string;
  job_id: string;
  job_name: string;
  priority: number;
  queued_at: string;
  position: number;
}
```

---

## 4. Detailed Component Design

### 4.1 Worker Pool Service

**File**: `backend/app/services/worker_pool.py`

```python
"""
Worker Pool: asyncio.Semaphore-based concurrent job execution manager.

Responsibilities:
- Global concurrency limit via Semaphore(MAX_CONCURRENT_JOBS)
- Per-job concurrency via Lock Manager (max_concurrent per job)
- Worker ID assignment and tracking
- Graceful shutdown with running job tracking
"""

import asyncio
import uuid
from dataclasses import dataclass, field


@dataclass
class WorkerPoolStats:
    max_workers: int
    active_workers: int
    queued_count: int
    lock_status: dict[str, int]  # job_id → current running count


class JobLockManager:
    """Per-job concurrency control using in-memory asyncio locks.

    Thread-safe within single event loop (all access on main thread).
    On server restart, locks are naturally released (in-memory).
    """

    def __init__(self):
        self._running_counts: dict[str, int] = {}  # job_id → running count
        self._lock = asyncio.Lock()  # protects _running_counts dict

    async def can_acquire(self, job_id: str, max_concurrent: int) -> bool:
        """Check if the job can start a new run without exceeding max_concurrent."""
        if max_concurrent <= 0:  # 0 = unlimited
            return True
        async with self._lock:
            current = self._running_counts.get(job_id, 0)
            return current < max_concurrent

    async def acquire(self, job_id: str, max_concurrent: int) -> bool:
        """Attempt to acquire a slot for this job. Returns False if at limit."""
        if max_concurrent <= 0:
            async with self._lock:
                self._running_counts[job_id] = self._running_counts.get(job_id, 0) + 1
            return True
        async with self._lock:
            current = self._running_counts.get(job_id, 0)
            if current >= max_concurrent:
                return False
            self._running_counts[job_id] = current + 1
            return True

    async def release(self, job_id: str):
        """Release one slot for this job. Always call in finally block."""
        async with self._lock:
            current = self._running_counts.get(job_id, 0)
            if current > 0:
                self._running_counts[job_id] = current - 1
            if self._running_counts.get(job_id, 0) == 0:
                self._running_counts.pop(job_id, None)

    def get_status(self) -> dict[str, int]:
        """Snapshot of current running counts per job."""
        return dict(self._running_counts)


class WorkerPool:
    """Global worker pool managing concurrent job execution."""

    def __init__(self, max_workers: int = 5):
        self._semaphore = asyncio.Semaphore(max_workers)
        self._max_workers = max_workers
        self._active_workers: dict[str, str] = {}  # worker_id → run_id
        self._lock_manager = JobLockManager()
        self._active_lock = asyncio.Lock()

    @property
    def lock_manager(self) -> JobLockManager:
        return self._lock_manager

    async def execute(self, job_id: str, run_id: str, max_concurrent: int,
                      coro_factory) -> bool:
        """Execute a job run within the worker pool.

        Args:
            job_id: The job ID for lock management
            run_id: The run ID for tracking
            max_concurrent: Per-job concurrency limit
            coro_factory: Callable that returns the coroutine to execute
                          (called only after acquiring both semaphore and lock)

        Returns:
            True if execution started, False if rejected (lock full)
        """
        # Check per-job lock first (cheap, in-memory)
        if not await self._lock_manager.can_acquire(job_id, max_concurrent):
            return False

        # Acquire global semaphore slot
        await self._semaphore.acquire()

        # Acquire per-job lock (double-check after semaphore)
        if not await self._lock_manager.acquire(job_id, max_concurrent):
            self._semaphore.release()
            return False

        worker_id = str(uuid.uuid4())
        async with self._active_lock:
            self._active_workers[worker_id] = run_id

        async def _run():
            try:
                await coro_factory(worker_id)
            finally:
                await self._lock_manager.release(job_id)
                self._semaphore.release()
                async with self._active_lock:
                    self._active_workers.pop(worker_id, None)

        # Fire and forget — the worker runs independently
        asyncio.create_task(_run())
        return True

    async def get_stats(self) -> WorkerPoolStats:
        async with self._active_lock:
            active = len(self._active_workers)
        return WorkerPoolStats(
            max_workers=self._max_workers,
            active_workers=active,
            queued_count=0,  # filled by queue service
            lock_status=self._lock_manager.get_status(),
        )

    def resize(self, new_max: int):
        """Resize the worker pool. Only affects future acquisitions."""
        diff = new_max - self._max_workers
        self._max_workers = new_max
        if diff > 0:
            for _ in range(diff):
                self._semaphore.release()
        elif diff < 0:
            # Shrinking: new Semaphore (graceful — existing workers finish)
            self._semaphore = asyncio.Semaphore(new_max)


# Singleton instance (initialized on startup)
worker_pool: WorkerPool | None = None

def get_worker_pool() -> WorkerPool:
    global worker_pool
    if worker_pool is None:
        worker_pool = WorkerPool(max_workers=5)
    return worker_pool

def init_worker_pool(max_workers: int):
    global worker_pool
    worker_pool = WorkerPool(max_workers=max_workers)
```

**Key Design Decisions**:
- `asyncio.Semaphore` — no thread overhead, natural fit for async subprocess execution
- Per-job lock is `dict[str, int]` counter, not per-run Lock — allows `max_concurrent > 1`
- `coro_factory` pattern — the actual `run_job()` coroutine is created only after acquiring resources
- `fire-and-forget` via `asyncio.create_task()` — queue processor doesn't block waiting for completion

### 4.2 venv Manager Service

**File**: `backend/app/services/venv_manager.py`

```python
"""
venv Manager: Hash-based shared virtual environment caching.

Directory structure:
  {VENV_CACHE_DIR}/
    _default/              # No-requirements jobs (system python)
    {hash16}/              # Hash of sorted, normalized requirements
      venv/                # Actual virtualenv
      requirements.txt     # Frozen requirements
      created_at           # ISO timestamp
      last_used_at         # ISO timestamp (updated on each use)

Flow:
  1. Compute SHA256 hash of normalized requirements
  2. If {hash}/ exists → return venv python path (cache hit)
  3. If not → create venv, pip install, return python path
  4. Maintenance cron: delete venvs where last_used_at > VENV_MAX_AGE_DAYS
"""

import asyncio
import hashlib
import logging
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

VENV_INSTALL_TIMEOUT = 300  # 5 minutes for pip install


class VenvManager:
    def __init__(self, cache_dir: Path):
        self.cache_dir = cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self._creating: dict[str, asyncio.Event] = {}
        # Lock to prevent concurrent creation of the same venv

    def _compute_hash(self, requirements: str) -> str:
        """Normalize and hash requirements string."""
        lines = sorted(
            line.strip().lower()
            for line in requirements.strip().splitlines()
            if line.strip() and not line.strip().startswith("#")
        )
        normalized = "\n".join(lines)
        return hashlib.sha256(normalized.encode()).hexdigest()[:16]

    def _get_venv_dir(self, req_hash: str) -> Path:
        return self.cache_dir / req_hash

    def _get_python_path(self, venv_dir: Path) -> str:
        """Return the python executable path inside the venv."""
        bin_dir = venv_dir / "venv" / "bin"
        return str(bin_dir / "python")

    def get_default_python(self) -> str:
        """Return system python3 for jobs without requirements."""
        return "python3"

    async def ensure_venv(self, requirements: str | None) -> str:
        """Ensure venv exists for given requirements. Returns python path.

        - None/empty requirements → system python3
        - Cached venv → return immediately (update last_used_at)
        - New requirements → create venv + pip install (async, with timeout)
        - Concurrent calls for same hash → second caller waits for first
        """
        if not requirements or not requirements.strip():
            return self.get_default_python()

        req_hash = self._compute_hash(requirements)
        venv_dir = self._get_venv_dir(req_hash)
        python_path = self._get_python_path(venv_dir)

        # Cache hit
        if venv_dir.exists() and (venv_dir / "venv" / "bin" / "python").exists():
            self._touch_last_used(venv_dir)
            logger.info(f"venv cache hit: {req_hash}")
            return python_path

        # Concurrent creation guard
        if req_hash in self._creating:
            logger.info(f"Waiting for venv creation: {req_hash}")
            await self._creating[req_hash].wait()
            if (venv_dir / "venv" / "bin" / "python").exists():
                return python_path
            raise RuntimeError(f"venv creation failed for hash {req_hash}")

        # Create new venv
        event = asyncio.Event()
        self._creating[req_hash] = event
        try:
            await self._create_venv(venv_dir, requirements, req_hash)
            return python_path
        finally:
            event.set()
            self._creating.pop(req_hash, None)

    async def _create_venv(self, venv_dir: Path, requirements: str, req_hash: str):
        """Create virtualenv and install packages."""
        logger.info(f"Creating venv: {req_hash}")
        venv_dir.mkdir(parents=True, exist_ok=True)
        venv_path = venv_dir / "venv"

        # Step 1: python -m venv
        proc = await asyncio.create_subprocess_exec(
            "python3", "-m", "venv", str(venv_path),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=60)
        if proc.returncode != 0:
            raise RuntimeError(f"venv creation failed: {stderr.decode()}")

        # Step 2: Write requirements.txt
        req_file = venv_dir / "requirements.txt"
        req_file.write_text(requirements.strip() + "\n")

        # Step 3: pip install -r requirements.txt
        pip_path = venv_path / "bin" / "pip"
        proc = await asyncio.create_subprocess_exec(
            str(pip_path), "install", "-r", str(req_file),
            "--no-cache-dir",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(), timeout=VENV_INSTALL_TIMEOUT
        )
        if proc.returncode != 0:
            # Cleanup failed venv
            import shutil
            shutil.rmtree(venv_dir, ignore_errors=True)
            raise RuntimeError(
                f"pip install failed (exit {proc.returncode}):\n{stderr.decode()[-500:]}"
            )

        # Step 4: Write metadata
        (venv_dir / "created_at").write_text(datetime.now(timezone.utc).isoformat())
        self._touch_last_used(venv_dir)

        logger.info(f"venv created: {req_hash}")

    def _touch_last_used(self, venv_dir: Path):
        (venv_dir / "last_used_at").write_text(datetime.now(timezone.utc).isoformat())

    async def cleanup_stale(self, max_age_days: int = 30):
        """Remove venvs not used for max_age_days."""
        import shutil
        now = datetime.now(timezone.utc)
        removed = 0
        for entry in self.cache_dir.iterdir():
            if not entry.is_dir() or entry.name.startswith("_"):
                continue
            last_used_file = entry / "last_used_at"
            if last_used_file.exists():
                try:
                    last_used = datetime.fromisoformat(last_used_file.read_text().strip())
                    if last_used.tzinfo is None:
                        last_used = last_used.replace(tzinfo=timezone.utc)
                    age_days = (now - last_used).days
                    if age_days > max_age_days:
                        shutil.rmtree(entry, ignore_errors=True)
                        removed += 1
                        logger.info(f"Removed stale venv: {entry.name} (age: {age_days}d)")
                except Exception:
                    pass
        return removed

    def get_cache_stats(self) -> dict:
        """Return cache statistics."""
        total_size = 0
        count = 0
        for entry in self.cache_dir.iterdir():
            if entry.is_dir() and not entry.name.startswith("_"):
                count += 1
                for f in entry.rglob("*"):
                    if f.is_file():
                        total_size += f.stat().st_size
        return {"count": count, "total_size_bytes": total_size}
```

**Key Design Decisions**:
- `hash[:16]` — 16 hex chars = 64 bits, collision probability negligible for <10K unique requirement sets
- `asyncio.Event` for concurrent creation guard — if two jobs with the same requirements start simultaneously, second waits for first to finish venv creation
- `last_used_at` file — enables LRU-style cleanup without DB tracking
- `--no-cache-dir` for pip — we have our own cache layer (the entire venv), pip's cache wastes disk

### 4.3 Queue Service

**File**: `backend/app/services/queue_service.py`

```python
"""
Queue Service: DB-based priority queue using job_runs.status='queued'.

Design:
- No in-memory queue — all state in DB (survives restart)
- Queue processor runs every QUEUE_CHECK_INTERVAL seconds
- Picks runs in order: priority ASC, queued_at ASC (FIFO within same priority)
- Integrates with Worker Pool and Lock Manager for execution gating
"""

import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.job import Job
from app.models.job_run import JobRun

logger = logging.getLogger(__name__)


class QueueService:
    def __init__(self):
        self._processor_task: asyncio.Task | None = None
        self._running = False

    async def enqueue(self, db: Session, job_id: str, trigger_type: str = "scheduled",
                      attempt_number: int = 1, triggered_by: str | None = None) -> JobRun:
        """Create a new queued run for a job."""
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            raise ValueError(f"Job {job_id} not found")

        run = JobRun(
            job_id=job_id,
            status="queued",
            trigger_type=trigger_type,
            attempt_number=attempt_number,
            triggered_by=triggered_by,
            queued_at=datetime.now(timezone.utc),
        )
        db.add(run)
        db.commit()
        db.refresh(run)
        logger.info(f"Enqueued run {run.id} for job {job_id} (priority={job.priority})")
        return run

    def get_queued_runs(self, db: Session, limit: int = 20) -> list[dict]:
        """Get current queue contents, sorted by execution order."""
        runs = (
            db.query(JobRun, Job)
            .join(Job, JobRun.job_id == Job.id)
            .filter(JobRun.status == "queued")
            .order_by(Job.priority.asc(), JobRun.queued_at.asc())
            .limit(limit)
            .all()
        )
        result = []
        for i, (run, job) in enumerate(runs):
            result.append({
                "run_id": run.id,
                "job_id": job.id,
                "job_name": job.name,
                "priority": job.priority,
                "queued_at": run.queued_at.isoformat() if run.queued_at else None,
                "position": i + 1,
            })
        return result

    async def process_queue(self):
        """Pick the next queued run and attempt execution.

        Called periodically by the queue processor loop.
        Picks one run at a time to avoid race conditions.
        """
        from app.services.worker_pool import get_worker_pool
        from app.services.venv_manager import get_venv_manager
        from app.services.execution_service import run_job

        pool = get_worker_pool()

        db = SessionLocal()
        try:
            # Find next queued run (highest priority, oldest queued_at)
            result = (
                db.query(JobRun, Job)
                .join(Job, JobRun.job_id == Job.id)
                .filter(
                    JobRun.status == "queued",
                    Job.is_active == True,
                )
                .order_by(Job.priority.asc(), JobRun.queued_at.asc())
                .first()
            )

            if not result:
                return

            run, job = result

            # Try to execute via worker pool (checks both global + per-job limits)
            async def coro_factory(worker_id: str):
                # Update run status
                _db = SessionLocal()
                try:
                    _run = _db.query(JobRun).filter(JobRun.id == run.id).first()
                    if _run:
                        _run.status = "running"
                        _run.worker_id = worker_id
                        _run.started_at = datetime.now(timezone.utc)
                        _db.commit()
                finally:
                    _db.close()

                # Resolve python path
                venv_mgr = get_venv_manager()
                python_path = await venv_mgr.ensure_venv(job.requirements)

                # Execute
                await run_job(
                    job.id, run.id, job.code, job.timeout_seconds,
                    job.env_dict, python_path=python_path
                )

            started = await pool.execute(
                job_id=job.id,
                run_id=run.id,
                max_concurrent=job.max_concurrent,
                coro_factory=coro_factory,
            )

            if not started:
                logger.debug(f"Run {run.id} stays queued (worker/lock limit reached)")

        except Exception as e:
            logger.error(f"Queue processing error: {e}")
        finally:
            db.close()

    async def start_processor(self, interval: int = 5):
        """Start the queue processor loop."""
        self._running = True
        logger.info(f"Queue processor started (interval={interval}s)")
        while self._running:
            try:
                await self.process_queue()
            except Exception as e:
                logger.error(f"Queue processor error: {e}")
            await asyncio.sleep(interval)

    def stop_processor(self):
        """Stop the queue processor loop."""
        self._running = False
        if self._processor_task:
            self._processor_task.cancel()
```

**Key Design Decisions**:
- **DB-based queue** — survives server restart, no Redis dependency
- **Single-row pickup** per cycle — avoids complex locking; 5s interval is fast enough
- **`coro_factory` pattern** — venv resolution and DB updates happen inside the worker slot (after semaphore acquire), not before
- **Priority ordering** — `priority ASC, queued_at ASC` = highest priority first, FIFO within same priority

### 4.4 DAG Service

**File**: `backend/app/services/dag_service.py`

```python
"""
DAG Service: Job dependency management.

- Validates DAG on job create/update (cycle detection via DFS)
- On job completion (success), checks if any dependent jobs should trigger
- 'depends_on' is a JSON array of job IDs stored on the Job model
- A dependent job triggers ONLY when ALL parent jobs' latest runs are 'success'
- If any parent fails, dependent job is marked 'skipped'
"""

import logging
from sqlalchemy.orm import Session
from app.models.job import Job
from app.models.job_run import JobRun

logger = logging.getLogger(__name__)


class DAGService:

    def validate_dependencies(self, db: Session, job_id: str, depends_on: list[str]) -> dict:
        """Validate that adding these dependencies won't create a cycle.

        Returns: {"valid": True} or {"valid": False, "error": "cycle detected: A→B→C→A"}
        """
        if not depends_on:
            return {"valid": True}

        # Check all referenced jobs exist
        existing_ids = {
            row[0] for row in db.query(Job.id).filter(Job.id.in_(depends_on)).all()
        }
        missing = set(depends_on) - existing_ids
        if missing:
            return {"valid": False, "error": f"Jobs not found: {', '.join(missing)}"}

        # Self-reference check
        if job_id in depends_on:
            return {"valid": False, "error": "Job cannot depend on itself"}

        # Build adjacency list for DFS cycle detection
        all_jobs = db.query(Job.id, Job.depends_on).all()
        graph: dict[str, list[str]] = {}
        for jid, deps in all_jobs:
            import json
            if jid == job_id:
                # Use the proposed new dependencies
                graph[jid] = depends_on
            elif deps:
                graph[jid] = json.loads(deps)
            else:
                graph[jid] = []

        # DFS cycle detection
        WHITE, GRAY, BLACK = 0, 1, 2
        color = {jid: WHITE for jid in graph}
        path = []

        def dfs(node: str) -> str | None:
            color[node] = GRAY
            path.append(node)
            for neighbor in graph.get(node, []):
                if neighbor not in color:
                    continue
                if color[neighbor] == GRAY:
                    cycle_start = path.index(neighbor)
                    cycle = path[cycle_start:] + [neighbor]
                    return " → ".join(cycle)
                if color[neighbor] == WHITE:
                    result = dfs(neighbor)
                    if result:
                        return result
            color[node] = BLACK
            path.pop()
            return None

        for node in graph:
            if color.get(node) == WHITE:
                cycle = dfs(node)
                if cycle:
                    return {"valid": False, "error": f"Cycle detected: {cycle}"}

        return {"valid": True}

    async def on_job_completed(self, db: Session, job_id: str, status: str):
        """Called after a job run completes. Triggers dependent jobs if applicable.

        Logic:
        1. Find all jobs where depends_on includes job_id
        2. For each dependent job, check if ALL parents' latest runs are 'success'
        3. If yes → enqueue the dependent job (trigger_type='dependency')
        4. If any parent 'failed' → create 'skipped' run for dependent
        """
        import json
        from app.services.queue_service import get_queue_service

        # Find dependent jobs
        all_jobs = db.query(Job).filter(Job.depends_on.isnot(None)).all()
        dependents = []
        for job in all_jobs:
            deps = json.loads(job.depends_on) if job.depends_on else []
            if job_id in deps:
                dependents.append(job)

        if not dependents:
            return

        queue = get_queue_service()

        for dep_job in dependents:
            if not dep_job.is_active:
                continue

            deps = json.loads(dep_job.depends_on)
            all_parents_success = True
            any_parent_failed = False

            for parent_id in deps:
                # Get latest run of parent job
                latest_run = (
                    db.query(JobRun)
                    .filter(JobRun.job_id == parent_id)
                    .order_by(JobRun.created_at.desc())
                    .first()
                )
                if not latest_run or latest_run.status != "success":
                    all_parents_success = False
                if latest_run and latest_run.status == "failed":
                    any_parent_failed = True

            if all_parents_success:
                logger.info(
                    f"DAG: All parents complete for {dep_job.name}, enqueueing"
                )
                await queue.enqueue(
                    db, dep_job.id, trigger_type="dependency"
                )
            elif any_parent_failed:
                # Mark dependent as skipped
                skipped_run = JobRun(
                    job_id=dep_job.id,
                    status="skipped",
                    trigger_type="dependency",
                    error_message=f"Parent job {job_id} failed",
                )
                db.add(skipped_run)
                db.commit()
                logger.info(f"DAG: Skipped {dep_job.name} (parent failed)")
```

**Key Design Decisions**:
- **DFS cycle detection** — classic 3-color algorithm, runs on save (not on every execution)
- **"Latest run" check** — looks at the most recent run of each parent, not a specific run ID. Simple and works for most pipeline use cases
- **`skipped` status** — clearly shows why a dependent job didn't run

### 4.5 Maintenance Service

**File**: `backend/app/services/maintenance_service.py`

```python
"""
Maintenance Service: Automated cleanup operations.

- History retention: delete old runs + logs beyond RETENTION_DAYS
- venv cleanup: remove unused venvs beyond VENV_MAX_AGE_DAYS
- Orphaned run recovery: mark 'running'/'queued' as 'failed' on startup
"""

import logging
from datetime import datetime, timezone, timedelta

from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models.job_run import JobRun
from app.models.job_log import JobLog

logger = logging.getLogger(__name__)


class MaintenanceService:

    async def cleanup_history(self, retention_days: int = 30) -> dict:
        """Delete runs and logs older than retention_days."""
        cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
        db = SessionLocal()
        try:
            # Find old runs
            old_runs = db.query(JobRun).filter(
                JobRun.created_at < cutoff,
                JobRun.status.in_(["success", "failed", "cancelled", "skipped"]),
            ).all()

            run_ids = [r.id for r in old_runs]
            if not run_ids:
                return {"deleted_runs": 0, "deleted_logs": 0}

            # Delete logs first (FK constraint)
            deleted_logs = db.query(JobLog).filter(
                JobLog.job_run_id.in_(run_ids)
            ).delete(synchronize_session=False)

            deleted_runs = db.query(JobRun).filter(
                JobRun.id.in_(run_ids)
            ).delete(synchronize_session=False)

            db.commit()
            logger.info(f"Cleanup: deleted {deleted_runs} runs, {deleted_logs} logs")
            return {"deleted_runs": deleted_runs, "deleted_logs": deleted_logs}
        finally:
            db.close()

    async def recover_orphaned_runs(self) -> int:
        """Mark 'running'/'queued' runs as 'failed' (server restart recovery)."""
        db = SessionLocal()
        try:
            orphans = db.query(JobRun).filter(
                JobRun.status.in_(["running", "queued"])
            ).all()

            count = 0
            for run in orphans:
                run.status = "failed"
                run.error_message = "Server restarted while job was running"
                run.finished_at = datetime.now(timezone.utc)
                count += 1

            if count:
                db.commit()
                logger.info(f"Recovered {count} orphaned runs")
            return count
        finally:
            db.close()

    async def cleanup_venvs(self, max_age_days: int = 30) -> int:
        """Remove unused venvs."""
        from app.services.venv_manager import get_venv_manager
        mgr = get_venv_manager()
        return await mgr.cleanup_stale(max_age_days)
```

---

## 5. API Specification

### 5.1 New Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/queue/status | Get queue status + worker stats | Required |
| POST | /api/jobs/{id}/clone | Clone a job | Required |
| POST | /api/jobs/bulk | Bulk operations (run/stop/activate/deactivate) | Required |
| GET | /api/jobs/export | Export jobs as JSON | Required |
| POST | /api/jobs/import | Import jobs from JSON | Required |
| GET | /api/jobs/{id}/dependencies | Get dependency graph | Required |
| POST | /api/jobs/{id}/dependencies/validate | Validate dependencies | Required |
| GET | /api/runs/trend/{job_id} | Duration trend data | Required |
| GET | /api/system/config | Get system config | Admin |
| PUT | /api/system/config | Update system config | Admin |

### 5.2 Detailed Specifications

#### `GET /api/queue/status`

**Response (200):**
```json
{
  "queued_runs": [
    {
      "run_id": "uuid",
      "job_id": "uuid",
      "job_name": "Scrape News",
      "priority": 3,
      "queued_at": "2026-03-21T10:00:00Z",
      "position": 1
    }
  ],
  "active_workers": 3,
  "max_workers": 5,
  "lock_status": {
    "job-uuid-1": 1,
    "job-uuid-2": 2
  }
}
```

#### `POST /api/jobs/{id}/clone`

**Response (201):**
```json
{
  "id": "new-uuid",
  "name": "Original Name (Copy)",
  "...": "same as original except: id, name, created_at, is_active=false"
}
```

#### `POST /api/jobs/bulk`

**Request:**
```json
{
  "job_ids": ["uuid-1", "uuid-2", "uuid-3"],
  "action": "run" | "stop" | "activate" | "deactivate" | "delete"
}
```

**Response (200):**
```json
{
  "success": 2,
  "failed": 1,
  "results": [
    {"job_id": "uuid-1", "status": "ok"},
    {"job_id": "uuid-2", "status": "ok"},
    {"job_id": "uuid-3", "status": "error", "message": "Job not found"}
  ]
}
```

#### `GET /api/jobs/export`

**Query params**: `?job_ids=uuid-1,uuid-2` (optional, default: all)

**Response (200):**
```json
{
  "version": "1.0",
  "exported_at": "2026-03-21T10:00:00Z",
  "jobs": [
    {
      "name": "Job Name",
      "description": "...",
      "code": "...",
      "schedule_type": "cron",
      "cron_expression": "*/5 * * * *",
      "requirements": "requests==2.31.0\nbeautifulsoup4",
      "max_concurrent": 1,
      "depends_on_names": ["Parent Job Name"],
      "tags": ["scraping"],
      "...": "all fields except id, created_by, created_at"
    }
  ]
}
```

#### `POST /api/jobs/import`

**Request:**
```json
{
  "jobs": [ /* same format as export */ ],
  "overwrite_existing": false
}
```

**Response (201):**
```json
{
  "imported": 3,
  "skipped": 1,
  "errors": []
}
```

#### `GET /api/runs/trend/{job_id}`

**Query params**: `?last_n=30`

**Response (200):**
```json
{
  "job_id": "uuid",
  "job_name": "Scrape News",
  "data_points": [
    {"run_id": "uuid", "started_at": "...", "duration_ms": 12500, "status": "success"},
    {"run_id": "uuid", "started_at": "...", "duration_ms": 15200, "status": "success"},
    {"run_id": "uuid", "started_at": "...", "duration_ms": null, "status": "failed"}
  ]
}
```

#### `GET /api/system/config`

**Response (200):**
```json
{
  "MAX_CONCURRENT_JOBS": 5,
  "RETENTION_DAYS": 30,
  "QUEUE_CHECK_INTERVAL": 5,
  "VENV_MAX_AGE_DAYS": 30
}
```

#### `PUT /api/system/config`

**Request:**
```json
{
  "MAX_CONCURRENT_JOBS": 8,
  "RETENTION_DAYS": 60
}
```

**Response (200):** Same as GET response with updated values.

Side effect: If `MAX_CONCURRENT_JOBS` changed → call `worker_pool.resize(new_value)`.

### 5.3 Modified Endpoints

| Existing Endpoint | Change |
|-------------------|--------|
| `POST /api/jobs` | Accept `requirements`, `max_concurrent`, `depends_on` fields |
| `PUT /api/jobs/{id}` | Accept same new fields + validate DAG on depends_on change |
| `POST /api/jobs/{id}/run` | Route through Queue Service instead of direct execution |
| `GET /api/system/stats` | Add `queued_jobs`, `max_concurrent_jobs`, `active_workers`, `venv_cache_count` |

---

## 6. UI/UX Design

### 6.1 Job Create/Edit Page — New Fields

```
┌─────────────────────────────────────────────────────────────┐
│  [Basic Info]  [Code]  [Schedule]  [Data]  [Advanced] ←NEW  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ── Advanced Tab ──────────────────────────────────────────  │
│                                                              │
│  Pip 패키지 (requirements)                                    │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ requests==2.31.0                                      │   │
│  │ beautifulsoup4                                        │   │
│  │ google-cloud-bigquery                                 │   │
│  └──────────────────────────────────────────────────────┘   │
│  * 한 줄에 패키지 하나 (pip format)                           │
│                                                              │
│  동시 실행 제한 (max_concurrent)                               │
│  ┌────┐                                                     │
│  │ 1  │  * 1 = 중복 실행 방지, 0 = 무제한                     │
│  └────┘                                                     │
│                                                              │
│  의존 Job (depends_on) ── Phase 2                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ [x] Scrape News (cron · */5 * * * *)                  │   │
│  │ [x] BigQuery Daily (interval · 3600s)                 │   │
│  │ [ ] Clean Temp Files (manual)                         │   │
│  └──────────────────────────────────────────────────────┘   │
│  * 선택한 Job이 모두 성공해야 이 Job 자동 실행                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 Dashboard — Worker Pool Widget

```
┌─────────────────────────────────────────────────────────────┐
│  Worker Pool                                    설정 →       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ████████░░  3 / 5 workers active                            │
│                                                              │
│  Queue: 2 jobs waiting                                       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ #1  Scrape News       priority: 3    2분 전 대기       │   │
│  │ #2  ETL Pipeline      priority: 5    30초 전 대기      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  venv Cache: 4 envs · 245 MB                                │
└─────────────────────────────────────────────────────────────┘
```

### 6.3 Job Detail — Dependencies View

```
┌─────────────────────────────────────────────────────────────┐
│  [Overview]  [Code]  [Runs]  [Logs]  [Dependencies] ←NEW    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Upstream (이 Job이 의존하는 Job)                              │
│  ┌────────────┐    ┌────────────┐                           │
│  │ Scrape News│───▶│ THIS JOB   │                           │
│  │ ✅ success │    │            │                           │
│  └────────────┘    └────────────┘                           │
│  ┌────────────┐         │                                   │
│  │ BigQuery   │─────────┘                                   │
│  │ 🔄 running │                                             │
│  └────────────┘                                             │
│                                                              │
│  Downstream (이 Job에 의존하는 Job)                            │
│  ┌────────────┐                                             │
│  │ Report Gen │  trigger_type: dependency                   │
│  │ ⏳ waiting │                                             │
│  └────────────┘                                             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 6.4 Job Detail — Duration Trend Chart

```
┌─────────────────────────────────────────────────────────────┐
│  실행 시간 트렌드 (최근 30회)                                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  25s │                        ╱╲                             │
│  20s │              ╱╲      ╱    ╲                           │
│  15s │    ╱╲      ╱    ╲  ╱        ╲  ╱╲                    │
│  10s │  ╱    ╲  ╱        ╲╱          ╲╱    ╲                │
│   5s │╱        ╲                              ╲              │
│   0s └──────────────────────────────────────────────        │
│       3/1  3/5  3/10  3/15  3/20                            │
│                                                              │
│  Avg: 14.2s  |  Min: 5.1s  |  Max: 24.8s                   │
└─────────────────────────────────────────────────────────────┘
```

### 6.5 Job List — Bulk Actions

```
┌─────────────────────────────────────────────────────────────┐
│  ☑ Select All  │ 3 selected: [▶ Run All] [⏹ Stop] [Export] │
├─────────────────────────────────────────────────────────────┤
│  ☑ Scrape News         cron · */5 * * * *    ✅ success     │
│  ☐ BigQuery Daily      interval · 3600s      🔄 running     │
│  ☑ ETL Pipeline        manual                ❌ failed      │
│  ☑ Report Generator    cron · 0 9 * * *      ✅ success     │
└─────────────────────────────────────────────────────────────┘

[Import Jobs]  [Export Selected]
```

### 6.6 Settings Page — System Config

```
┌─────────────────────────────────────────────────────────────┐
│  System Configuration                                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  동시 실행 Worker 수 (MAX_CONCURRENT_JOBS)                    │
│  ┌────┐                                                     │
│  │ 5  │  * 1~20, 서버 리소스에 따라 조정                       │
│  └────┘                                                     │
│                                                              │
│  실행 이력 보관 기간 (RETENTION_DAYS)                           │
│  ┌─────┐                                                    │
│  │ 30  │ 일  * 이 기간이 지난 완료된 run/log 자동 삭제          │
│  └─────┘                                                    │
│                                                              │
│  venv 캐시 보관 기간 (VENV_MAX_AGE_DAYS)                      │
│  ┌─────┐                                                    │
│  │ 30  │ 일  * 미사용 가상환경 자동 삭제                        │
│  └─────┘                                                    │
│                                                              │
│  [Save Changes]                                              │
└─────────────────────────────────────────────────────────────┘
```

### 6.7 Component List

| Component | Location | Responsibility |
|-----------|----------|----------------|
| `RequirementsEditor` | `features/jobs/components/` | Textarea with pip format hint + validation |
| `DependencySelector` | `features/jobs/components/` | Multi-select dropdown of available jobs |
| `WorkerPoolWidget` | `features/dashboard/components/` | Progress bar + queue list |
| `QueueMonitor` | `features/dashboard/components/` | Real-time queue status |
| `DependencyGraph` | `features/jobs/components/` | Upstream/downstream visualization |
| `DurationTrendChart` | `features/jobs/components/` | Recharts line chart (already have recharts) |
| `BulkActionBar` | `features/jobs/components/` | Floating action bar for selected jobs |
| `ImportExportDialog` | `features/jobs/components/` | File upload/download modal |
| `SystemConfigForm` | `features/settings/components/` | Dynamic config editor |

---

## 7. Integration with Existing Code

### 7.1 execution_service.py Changes

The current `run_job()` function needs a new `python_path` parameter:

```python
# BEFORE
async def run_job(job_id, run_id, code, timeout, env_vars=None):
    ...
    process = await asyncio.create_subprocess_exec(
        "python3", "-u", str(code_file), ...
    )

# AFTER
async def run_job(job_id, run_id, code, timeout, env_vars=None, python_path="python3"):
    ...
    process = await asyncio.create_subprocess_exec(
        python_path, "-u", str(code_file), ...
    )
```

Add DAG trigger at the end of run completion:

```python
# After webhook notification block
try:
    from app.services.dag_service import get_dag_service
    dag = get_dag_service()
    await dag.on_job_completed(db, job_id, run.status)
except Exception:
    pass
```

### 7.2 scheduler/engine.py Changes

`execute_scheduled_job` routes through Queue Service:

```python
# BEFORE
async def execute_scheduled_job(job_id: str):
    ...
    run = JobRun(job_id=job_id, status="pending", trigger_type="scheduled")
    ...
    await run_job(job_id, run.id, job.code, job.timeout_seconds, job.env_dict)

# AFTER
async def execute_scheduled_job(job_id: str):
    from app.services.queue_service import get_queue_service
    db = SessionLocal()
    try:
        queue = get_queue_service()
        await queue.enqueue(db, job_id, trigger_type="scheduled")
    finally:
        db.close()
```

Add queue processor and maintenance cron registration at startup:

```python
def start_scheduler():
    s = get_scheduler()
    if not s.running:
        s.start()

        # Register maintenance jobs
        from app.services.maintenance_service import MaintenanceService
        maint = MaintenanceService()

        # Daily: cleanup old history
        s.add_job(maint.cleanup_history, 'cron', hour=3, minute=0,
                  id='maintenance_history', replace_existing=True)

        # Weekly: cleanup stale venvs
        s.add_job(maint.cleanup_venvs, 'cron', day_of_week='sun', hour=4,
                  id='maintenance_venvs', replace_existing=True)
```

### 7.3 main.py Startup Changes

```python
@app.on_event("startup")
async def startup():
    ...
    # Recover orphaned runs (before starting scheduler)
    from app.services.maintenance_service import MaintenanceService
    maint = MaintenanceService()
    await maint.recover_orphaned_runs()

    # Initialize worker pool from system config
    from app.services.worker_pool import init_worker_pool
    # Read MAX_CONCURRENT_JOBS from system_config table (default 5)
    init_worker_pool(max_workers=5)

    # Start queue processor
    from app.services.queue_service import get_queue_service
    queue = get_queue_service()
    asyncio.create_task(queue.start_processor(interval=5))

    # Start scheduler
    start_scheduler()
```

### 7.4 Config Changes

```python
# config.py additions
class Settings(BaseSettings):
    # ... existing ...

    # Concurrent Execution
    MAX_CONCURRENT_JOBS: int = 5
    VENV_CACHE_DIR: Path = Path(__file__).resolve().parent.parent / "jobs_venvs"
    VENV_MAX_AGE_DAYS: int = 30
    RETENTION_DAYS: int = 30
    QUEUE_CHECK_INTERVAL: int = 5
```

---

## 8. Error Handling

### 8.1 Error Scenarios

| Scenario | Handling | User Impact |
|----------|----------|-------------|
| pip install fails | Cleanup venv dir, run status='failed', error_message with last 500 chars of stderr | Job fails with clear pip error |
| pip install timeout (>300s) | Kill process, cleanup, mark failed | "패키지 설치 시간 초과" |
| venv creation fails | Fallback error, mark run failed | "가상환경 생성 실패" |
| Cycle in DAG | Reject on save with cycle path | "순환 의존성 감지: A → B → C → A" |
| Missing parent job in DAG | Reject on save | "Job을 찾을 수 없음: {id}" |
| Worker pool full + lock full | Run stays queued, retried on next cycle | Queue position shown in UI |
| Server restart while running | Orphaned runs → failed on next startup | "서버 재시작으로 중단됨" |
| venv disk full | pip install fails naturally | "디스크 공간 부족" |
| Concurrent venv creation race | asyncio.Event waits for first creator | No duplicate venvs |

### 8.2 Error Response Format

All new API endpoints follow existing error format:

```json
{
  "detail": "Human-readable error message"
}
```

DAG validation errors:
```json
{
  "detail": "Cycle detected: Scrape News → ETL Pipeline → Scrape News"
}
```

---

## 9. Security Considerations

- [x] Input validation: requirements field sanitized (no shell injection via pip)
- [x] pip install runs in isolated venv, not system Python
- [x] Subprocess execution with `cwd=tempdir` (no access to app directory)
- [x] System config changes require admin role
- [x] Import/Export validates job data schema before import
- [ ] Rate limiting on bulk operations (prevent DoS via 1000 simultaneous runs)
- [ ] venv sandbox: consider `--no-deps` option for stricter control

---

## 10. Test Plan

### 10.1 Test Scope

| Type | Target | Method |
|------|--------|--------|
| Unit | Worker Pool semaphore/lock | Manual async test |
| Unit | venv Manager hash + cache | File system verification |
| Unit | DAG cycle detection | Known cycle/acyclic graphs |
| Integration | Queue → Worker → venv → Subprocess | Full pipeline execution |
| Integration | DAG auto-trigger chain | A→B→C execution sequence |
| E2E | Create job with requirements → run → verify output | Browser + API |
| Load | 10 simultaneous jobs with MAX=5 | Verify 5 run, 5 queued |

### 10.2 Key Test Cases

- [ ] 5 jobs with different requirements run simultaneously without interference
- [ ] Same job triggered twice with `max_concurrent=1` — second stays queued
- [ ] `max_concurrent=0` (unlimited) — multiple runs execute in parallel
- [ ] venv cache hit: second run with same requirements starts in <3s
- [ ] venv cache miss: pip install creates new venv, subsequent runs use cache
- [ ] DAG: A→B→C chain executes in order, A success triggers B
- [ ] DAG: Parent A fails → dependent B marked 'skipped'
- [ ] DAG: Cycle A→B→A rejected on save with clear error
- [ ] Queue: 10 jobs enqueued, processed in priority order
- [ ] Server restart: running jobs marked as failed, queue resumes
- [ ] Retention: runs older than RETENTION_DAYS deleted by cron
- [ ] venv cleanup: venvs unused for VENV_MAX_AGE_DAYS deleted
- [ ] Bulk run: 5 selected jobs all enqueued
- [ ] Import/Export: export 3 jobs → import on fresh system → all restored

---

## 11. Implementation Order

### Phase 1: Core Concurrent Execution (FR-01 ~ FR-04)

| Step | Task | Files | Est. |
|------|------|-------|------|
| 1.1 | Config 추가 (`MAX_CONCURRENT_JOBS`, `VENV_CACHE_DIR`, etc.) | `config.py` | 10m |
| 1.2 | `system_config` 테이블 + 모델 | `models/system_config.py`, `database.py` | 15m |
| 1.3 | Worker Pool + Lock Manager 구현 | `services/worker_pool.py` | 40m |
| 1.4 | venv Manager 구현 | `services/venv_manager.py` | 40m |
| 1.5 | Queue Service 구현 | `services/queue_service.py` | 30m |
| 1.6 | Job 모델/스키마에 `requirements`, `max_concurrent` 추가 | `models/job.py`, `schemas/job.py` | 15m |
| 1.7 | JobRun 모델에 `queued_at`, `worker_id`, `queued`/`skipped` 상태 | `models/job_run.py` | 15m |
| 1.8 | DB 마이그레이션 | `database.py` | 10m |
| 1.9 | `execution_service.py` 수정 (python_path 파라미터) | `services/execution_service.py` | 20m |
| 1.10 | `scheduler/engine.py` 수정 (Queue 통합) | `scheduler/engine.py` | 20m |
| 1.11 | `main.py` startup 수정 (worker pool init, queue start, orphan recovery) | `main.py` | 15m |
| 1.12 | Maintenance Service 구현 | `services/maintenance_service.py` | 20m |
| 1.13 | 프론트엔드: `requirements`, `max_concurrent` UI | `JobCreatePage.tsx`, `JobEditPage.tsx` | 30m |
| 1.14 | 프론트엔드: 대시보드 Worker Pool 위젯 | `DashboardPage.tsx` | 25m |
| 1.15 | 프론트엔드: 타입 + API 클라이언트 수정 | `api.ts`, `types/api.ts` | 15m |
| 1.16 | System Config API + Settings UI | `routers/`, `SettingsPage.tsx` | 25m |

**Phase 1 Total: ~345m (~5.75h)**

### Phase 2: DAG & Queue (FR-05 ~ FR-06)

| Step | Task | Files | Est. |
|------|------|-------|------|
| 2.1 | Job 모델에 `depends_on` 추가 | `models/job.py`, `schemas/job.py` | 15m |
| 2.2 | DAG Service 구현 (검증 + 트리거) | `services/dag_service.py` | 40m |
| 2.3 | execution_service에 DAG 트리거 통합 | `services/execution_service.py` | 15m |
| 2.4 | 의존성 검증 API + 그래프 조회 API | `routers/jobs.py` | 20m |
| 2.5 | 프론트엔드: DependencySelector 컴포넌트 | `features/jobs/components/` | 30m |
| 2.6 | 프론트엔드: DependencyGraph 시각화 | `features/jobs/components/` | 30m |
| 2.7 | 프론트엔드: StatusBadge에 `queued`, `skipped` 추가 | `components/shared/StatusBadge.tsx` | 10m |

**Phase 2 Total: ~160m (~2.67h)**

### Phase 3: Operations & Monitoring (FR-07 ~ FR-12)

| Step | Task | Files | Est. |
|------|------|-------|------|
| 3.1 | Job Clone API | `routers/jobs.py`, `services/job_service.py` | 15m |
| 3.2 | Bulk Actions API | `routers/jobs.py`, `services/job_service.py` | 20m |
| 3.3 | Import/Export API | `routers/jobs.py`, `services/job_service.py` | 30m |
| 3.4 | Duration Trend API | `routers/runs.py` | 15m |
| 3.5 | Queue Status API | `routers/queue.py` (NEW) | 15m |
| 3.6 | 프론트엔드: BulkActionBar + checkbox selection | `JobListPage.tsx` | 30m |
| 3.7 | 프론트엔드: ImportExportDialog | `features/jobs/components/` | 25m |
| 3.8 | 프론트엔드: DurationTrendChart (recharts) | `features/jobs/components/` | 25m |
| 3.9 | 프론트엔드: QueueMonitor 위젯 | `features/dashboard/components/` | 20m |

**Phase 3 Total: ~195m (~3.25h)**

**Grand Total: ~700m (~11.7h)**

---

## 12. File Structure (New + Modified)

```
backend/app/
├── config.py                          # (수정) 동시성/venv/보관 설정
├── database.py                        # (수정) 마이그레이션 추가
├── main.py                            # (수정) startup: worker pool, queue, orphan recovery
├── models/
│   ├── job.py                         # (수정) requirements, max_concurrent, depends_on
│   ├── job_run.py                     # (수정) queued_at, worker_id, queued/skipped status
│   └── system_config.py              # (신규) SystemConfig 모델
├── schemas/
│   ├── job.py                         # (수정) 신규 필드 추가
│   └── system_config.py              # (신규) SystemConfig 스키마
├── services/
│   ├── execution_service.py           # (수정) python_path 파라미터 + DAG 트리거
│   ├── worker_pool.py                # (신규) WorkerPool + JobLockManager
│   ├── venv_manager.py               # (신규) VenvManager (hash cache)
│   ├── queue_service.py              # (신규) QueueService (DB queue)
│   ├── dag_service.py                # (신규) DAGService (validate + trigger)
│   └── maintenance_service.py        # (신규) cleanup history/venvs/orphans
├── routers/
│   ├── jobs.py                        # (수정) clone, bulk, import/export endpoints
│   ├── runs.py                        # (수정) trend endpoint
│   └── queue.py                      # (신규) queue status endpoint
└── scheduler/
    └── engine.py                      # (수정) Queue 통합, maintenance cron

frontend/src/
├── features/jobs/
│   ├── JobCreatePage.tsx              # (수정) requirements, max_concurrent, depends_on UI
│   ├── JobEditPage.tsx                # (수정) 동일
│   ├── JobDetailPage.tsx              # (수정) Dependencies 탭, Trend 차트
│   ├── JobListPage.tsx                # (수정) Bulk actions, Import/Export
│   └── components/                    # (신규 디렉토리)
│       ├── RequirementsEditor.tsx     # pip format textarea
│       ├── DependencySelector.tsx     # multi-select job picker
│       ├── DependencyGraph.tsx        # upstream/downstream visualization
│       ├── DurationTrendChart.tsx     # recharts line chart
│       ├── BulkActionBar.tsx          # floating action bar
│       └── ImportExportDialog.tsx     # file upload/download modal
├── features/dashboard/
│   ├── DashboardPage.tsx              # (수정) Worker Pool 위젯
│   └── components/                    # (신규 디렉토리)
│       ├── WorkerPoolWidget.tsx       # progress bar + queue preview
│       └── QueueMonitor.tsx           # real-time queue status
├── features/settings/
│   └── SettingsPage.tsx               # (수정) System Config 편집
├── api/
│   ├── jobs.ts                        # (수정) clone, bulk, import/export API
│   ├── runs.ts                        # (수정) trend API
│   └── queue.ts                       # (신규) queue status API
├── components/shared/
│   └── StatusBadge.tsx                # (수정) queued, skipped 상태 추가
└── types/
    └── api.ts                         # (수정) 신규 필드 + 타입 추가
```

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-21 | Initial design draft | jongsports |
