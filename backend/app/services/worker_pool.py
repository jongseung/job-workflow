"""
Worker Pool: asyncio.Semaphore-based concurrent job execution manager.

- Global concurrency limit via Semaphore(MAX_CONCURRENT_JOBS)
- Per-job concurrency via Lock Manager (max_concurrent per job)
- Worker ID assignment and tracking
"""

import asyncio
import logging
import uuid
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class WorkerPoolStats:
    max_workers: int
    active_workers: int
    queued_count: int
    lock_status: dict[str, int]


class JobLockManager:
    """Per-job concurrency control using in-memory counters.

    Thread-safe within single event loop. On server restart, locks are
    naturally released (in-memory only).
    """

    def __init__(self):
        self._running_counts: dict[str, int] = {}
        self._lock = asyncio.Lock()

    async def can_acquire(self, job_id: str, max_concurrent: int) -> bool:
        if max_concurrent <= 0:
            return True
        async with self._lock:
            current = self._running_counts.get(job_id, 0)
            return current < max_concurrent

    async def acquire(self, job_id: str, max_concurrent: int) -> bool:
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
        async with self._lock:
            current = self._running_counts.get(job_id, 0)
            if current > 0:
                self._running_counts[job_id] = current - 1
            if self._running_counts.get(job_id, 0) == 0:
                self._running_counts.pop(job_id, None)

    def get_status(self) -> dict[str, int]:
        return dict(self._running_counts)


class WorkerPool:
    """Global worker pool managing concurrent job execution."""

    def __init__(self, max_workers: int = 5):
        self._semaphore = asyncio.Semaphore(max_workers)
        self._max_workers = max_workers
        self._active_workers: dict[str, str] = {}  # worker_id -> run_id
        self._lock_manager = JobLockManager()
        self._active_lock = asyncio.Lock()

    @property
    def lock_manager(self) -> JobLockManager:
        return self._lock_manager

    @property
    def max_workers(self) -> int:
        return self._max_workers

    async def execute(self, job_id: str, run_id: str, max_concurrent: int,
                      coro_factory) -> bool:
        """Execute a job run within the worker pool.

        Returns True if execution started, False if rejected.
        Uses atomic check-and-acquire to prevent race conditions.
        """
        # Check per-job lock first (cheap)
        if not await self._lock_manager.can_acquire(job_id, max_concurrent):
            return False

        # Atomic semaphore check-and-acquire under lock to prevent race
        async with self._active_lock:
            if self._semaphore._value <= 0:
                return False
            await self._semaphore.acquire()

        # Per-job lock after global semaphore
        if not await self._lock_manager.acquire(job_id, max_concurrent):
            self._semaphore.release()
            return False

        worker_id = str(uuid.uuid4())
        async with self._active_lock:
            self._active_workers[worker_id] = run_id

        async def _run():
            try:
                await coro_factory(worker_id)
            except Exception as e:
                logger.error(f"Worker {worker_id} error for run {run_id}: {e}")
            finally:
                await self._lock_manager.release(job_id)
                self._semaphore.release()
                async with self._active_lock:
                    self._active_workers.pop(worker_id, None)

        asyncio.create_task(_run())
        return True

    async def get_stats(self, queued_count: int = 0) -> WorkerPoolStats:
        async with self._active_lock:
            active = len(self._active_workers)
        return WorkerPoolStats(
            max_workers=self._max_workers,
            active_workers=active,
            queued_count=queued_count,
            lock_status=self._lock_manager.get_status(),
        )

    def resize(self, new_max: int):
        """Resize worker pool. Only affects future acquisitions."""
        old_max = self._max_workers
        self._max_workers = new_max
        if new_max > old_max:
            for _ in range(new_max - old_max):
                self._semaphore.release()
        elif new_max < old_max:
            self._semaphore = asyncio.Semaphore(new_max)
        logger.info(f"Worker pool resized: {old_max} -> {new_max}")


# Singleton
_worker_pool: WorkerPool | None = None


def get_worker_pool() -> WorkerPool:
    global _worker_pool
    if _worker_pool is None:
        _worker_pool = WorkerPool(max_workers=5)
    return _worker_pool


def init_worker_pool(max_workers: int):
    global _worker_pool
    _worker_pool = WorkerPool(max_workers=max_workers)
    logger.info(f"Worker pool initialized with {max_workers} workers")
