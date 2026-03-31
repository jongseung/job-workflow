"""
Cross-platform subprocess execution helpers.

On Windows, Uvicorn forces SelectorEventLoop which does NOT support
asyncio.create_subprocess_exec(). We use subprocess.Popen + run_in_executor
to bypass this limitation while keeping the main event loop non-blocking.
"""

from __future__ import annotations

import asyncio
import subprocess
import sys
from pathlib import Path

_IS_WINDOWS = sys.platform == "win32"


async def run_subprocess(
    *args: str,
    stdin_data: bytes | None = None,
    env: dict | None = None,
    cwd: str | None = None,
    timeout: float | None = None,
) -> tuple[subprocess.Popen | None, bytes, bytes, int]:
    """Run a subprocess and return (process, stdout, stderr, returncode).

    Uses subprocess.Popen + run_in_executor for Windows compatibility.
    Works identically on macOS/Linux.
    """
    loop = asyncio.get_running_loop()

    def _run():
        kwargs = dict(
            stdin=subprocess.PIPE if stdin_data is not None else None,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            cwd=cwd,
        )
        if _IS_WINDOWS:
            kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP

        proc = subprocess.Popen(list(args), **kwargs)
        try:
            stdout, stderr = proc.communicate(input=stdin_data, timeout=timeout)
        except subprocess.TimeoutExpired:
            proc.kill()
            stdout, stderr = proc.communicate()
            return proc, stdout, stderr, -1  # -1 signals timeout
        return proc, stdout, stderr, proc.returncode

    return await loop.run_in_executor(None, _run)


class StreamingProcess:
    """Manages a subprocess with line-by-line streaming output.

    Uses threading to read stdout/stderr without blocking the event loop.
    Compatible with Windows SelectorEventLoop.
    """

    def __init__(
        self,
        *args: str,
        env: dict | None = None,
        cwd: str | None = None,
    ):
        self._args = list(args)
        self._env = env
        self._cwd = cwd
        self._process: subprocess.Popen | None = None

    def start(self):
        kwargs = dict(
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            stdin=subprocess.DEVNULL,
            env=self._env,
            cwd=self._cwd,
        )
        # Windows: create new process group so kill() terminates entire tree
        if _IS_WINDOWS:
            kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP

        self._process = subprocess.Popen(self._args, **kwargs)

        if self._process.returncode is not None:
            raise RuntimeError(
                f"Process failed to start (exit code {self._process.returncode})"
            )

    @property
    def process(self) -> subprocess.Popen | None:
        return self._process

    @property
    def pid(self) -> int | None:
        return self._process.pid if self._process else None

    @property
    def returncode(self) -> int | None:
        if self._process is None:
            return None
        return self._process.returncode

    async def read_streams(
        self,
        on_stdout_line,
        on_stderr_line,
        timeout: float | None = None,
    ):
        """Read stdout and stderr line-by-line, calling async callbacks.

        on_stdout_line(line: str) and on_stderr_line(line: str) are awaited.
        Raises asyncio.TimeoutError if timeout exceeded.
        """
        if self._process is None:
            raise RuntimeError("Process not started")

        loop = asyncio.get_running_loop()
        stdout_queue: asyncio.Queue[str | None] = asyncio.Queue()
        stderr_queue: asyncio.Queue[str | None] = asyncio.Queue()

        def _reader(stream, queue: asyncio.Queue):
            """Blocking reader running in a thread."""
            try:
                for raw_line in iter(stream.readline, b""):
                    # Strip both \r\n (Windows) and \n (Unix)
                    line = raw_line.decode("utf-8", errors="replace").rstrip("\r\n")
                    loop.call_soon_threadsafe(queue.put_nowait, line)
            except (ValueError, OSError):
                pass  # Stream closed
            finally:
                loop.call_soon_threadsafe(queue.put_nowait, None)

        # Start reader threads
        loop.run_in_executor(None, _reader, self._process.stdout, stdout_queue)
        loop.run_in_executor(None, _reader, self._process.stderr, stderr_queue)

        async def _consume(queue: asyncio.Queue, callback):
            while True:
                line = await queue.get()
                if line is None:
                    break
                await callback(line)

        try:
            await asyncio.wait_for(
                asyncio.gather(
                    _consume(stdout_queue, on_stdout_line),
                    _consume(stderr_queue, on_stderr_line),
                ),
                timeout=timeout,
            )
        except asyncio.TimeoutError:
            self.kill()
            # Drain remaining queue items
            await self.wait()
            raise

        await self.wait()

    async def wait(self) -> int:
        """Wait for process to finish (non-blocking)."""
        if self._process is None:
            return -1
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self._process.wait)

    def terminate(self):
        if self._process and self._process.returncode is None:
            self._process.terminate()

    def kill(self):
        if self._process and self._process.returncode is None:
            self._process.kill()
