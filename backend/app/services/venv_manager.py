"""
venv Manager: Hash-based shared virtual environment caching.

Directory structure:
  {VENV_CACHE_DIR}/
    {hash16}/              # SHA256[:16] of normalized requirements
      venv/                # virtualenv
      requirements.txt     # frozen requirements
      created_at           # ISO timestamp
      last_used_at         # ISO timestamp
"""

import asyncio
import hashlib
import logging
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

VENV_INSTALL_TIMEOUT = 300  # 5 minutes

_IS_WINDOWS = sys.platform == "win32"


def _venv_python(venv_path: Path) -> Path:
    """Return path to python executable inside a venv (cross-platform)."""
    if _IS_WINDOWS:
        return venv_path / "Scripts" / "python.exe"
    return venv_path / "bin" / "python"


def _venv_pip(venv_path: Path) -> Path:
    """Return path to pip executable inside a venv (cross-platform)."""
    if _IS_WINDOWS:
        return venv_path / "Scripts" / "pip.exe"
    return venv_path / "bin" / "pip"


class VenvManager:
    def __init__(self, cache_dir: Path):
        self.cache_dir = cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self._creating: dict[str, asyncio.Event] = {}

    def _compute_hash(self, requirements: str) -> str:
        lines = sorted(
            line.strip().lower()
            for line in requirements.strip().splitlines()
            if line.strip() and not line.strip().startswith("#")
        )
        normalized = "\n".join(lines)
        return hashlib.sha256(normalized.encode()).hexdigest()[:16]

    def _get_python_path(self, venv_dir: Path) -> str:
        return str(_venv_python(venv_dir / "venv"))

    async def ensure_venv(self, requirements: str | None) -> str:
        """Ensure venv exists for requirements. Returns python executable path."""
        if not requirements or not requirements.strip():
            return sys.executable

        req_hash = self._compute_hash(requirements)
        venv_dir = self.cache_dir / req_hash
        python_path = self._get_python_path(venv_dir)

        # Cache hit
        if venv_dir.exists() and _venv_python(venv_dir / "venv").exists():
            self._touch_last_used(venv_dir)
            logger.info(f"venv cache hit: {req_hash}")
            return python_path

        # Concurrent creation guard
        if req_hash in self._creating:
            logger.info(f"Waiting for venv creation: {req_hash}")
            await self._creating[req_hash].wait()
            if _venv_python(venv_dir / "venv").exists():
                return python_path
            raise RuntimeError(f"venv creation failed for hash {req_hash}")

        event = asyncio.Event()
        self._creating[req_hash] = event
        try:
            await self._create_venv(venv_dir, requirements, req_hash)
            return python_path
        finally:
            event.set()
            self._creating.pop(req_hash, None)

    async def _create_venv(self, venv_dir: Path, requirements: str, req_hash: str):
        logger.info(f"Creating venv: {req_hash}")
        venv_dir.mkdir(parents=True, exist_ok=True)
        venv_path = venv_dir / "venv"

        from app.services.subprocess_compat import run_subprocess

        # Step 1: python -m venv
        _, stdout, stderr, rc = await run_subprocess(
            sys.executable, "-m", "venv", str(venv_path),
            timeout=60,
        )
        if rc != 0:
            shutil.rmtree(venv_dir, ignore_errors=True)
            err = stderr.decode("utf-8", errors="replace")[:500] if stderr else "Unknown error"
            raise RuntimeError(f"venv creation failed: {err}")

        # Step 2: Write requirements.txt
        req_file = venv_dir / "requirements.txt"
        req_file.write_text(requirements.strip() + "\n")

        # Step 3: pip install
        pip_path = _venv_pip(venv_path)
        _, stdout, stderr, rc = await run_subprocess(
            str(pip_path), "install", "-r", str(req_file),
            timeout=VENV_INSTALL_TIMEOUT,
        )
        if rc == -1:
            shutil.rmtree(venv_dir, ignore_errors=True)
            raise RuntimeError(f"pip install timed out after {VENV_INSTALL_TIMEOUT}s")

        if rc != 0:
            error_msg = stderr.decode("utf-8", errors="replace")[-500:] if stderr else "Unknown error"
            shutil.rmtree(venv_dir, ignore_errors=True)
            raise RuntimeError(f"pip install failed (exit {rc}):\n{error_msg}")

        # Step 4: Metadata
        (venv_dir / "created_at").write_text(datetime.now(timezone.utc).isoformat())
        self._touch_last_used(venv_dir)
        logger.info(f"venv created: {req_hash}")

    def _touch_last_used(self, venv_dir: Path):
        (venv_dir / "last_used_at").write_text(datetime.now(timezone.utc).isoformat())

    async def cleanup_stale(self, max_age_days: int = 30) -> int:
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
                        logger.info(f"Removed stale venv: {entry.name} ({age_days}d)")
                except Exception:
                    pass
        return removed

    def get_cache_stats(self) -> dict:
        total_size = 0
        count = 0
        for entry in self.cache_dir.iterdir():
            if entry.is_dir() and not entry.name.startswith("_"):
                count += 1
                for f in entry.rglob("*"):
                    if f.is_file():
                        total_size += f.stat().st_size
        return {"count": count, "total_size_bytes": total_size}


# Singleton
_venv_manager: VenvManager | None = None


def get_venv_manager() -> VenvManager:
    global _venv_manager
    if _venv_manager is None:
        from app.config import settings
        _venv_manager = VenvManager(settings.VENV_CACHE_DIR)
    return _venv_manager


def init_venv_manager(cache_dir: Path):
    global _venv_manager
    _venv_manager = VenvManager(cache_dir)
    logger.info(f"venv manager initialized: {cache_dir}")
