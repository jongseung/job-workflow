import asyncio
import json
from fastapi import WebSocket

# Timeout for individual WebSocket send operations (seconds).
# Prevents a slow/stalled client from blocking the event loop during broadcast.
WS_SEND_TIMEOUT = 5


class ConnectionManager:
    def __init__(self):
        # run_id -> list of websocket connections
        self._log_connections: dict[str, list[WebSocket]] = {}
        # global event connections
        self._event_connections: list[WebSocket] = []

    async def connect_logs(self, run_id: str, websocket: WebSocket):
        await websocket.accept()
        if run_id not in self._log_connections:
            self._log_connections[run_id] = []
        self._log_connections[run_id].append(websocket)

    async def disconnect_logs(self, run_id: str, websocket: WebSocket):
        if run_id in self._log_connections:
            try:
                self._log_connections[run_id].remove(websocket)
            except ValueError:
                pass
            if not self._log_connections[run_id]:
                del self._log_connections[run_id]

    async def connect_events(self, websocket: WebSocket):
        await websocket.accept()
        self._event_connections.append(websocket)

    async def disconnect_events(self, websocket: WebSocket):
        try:
            self._event_connections.remove(websocket)
        except ValueError:
            pass

    async def _safe_send(self, ws: WebSocket, message: dict) -> bool:
        """Send JSON to a WebSocket with timeout. Returns False if failed."""
        try:
            await asyncio.wait_for(ws.send_json(message), timeout=WS_SEND_TIMEOUT)
            return True
        except (asyncio.TimeoutError, Exception):
            return False

    async def broadcast(self, run_id: str, message: dict):
        """Broadcast log message to all connections watching a specific run."""
        connections = self._log_connections.get(run_id, [])
        dead = []
        for ws in connections:
            if not await self._safe_send(ws, message):
                dead.append(ws)
        for ws in dead:
            try:
                connections.remove(ws)
            except ValueError:
                pass

    async def broadcast_event(self, message: dict):
        """Broadcast event to all global event connections."""
        dead = []
        for ws in self._event_connections:
            if not await self._safe_send(ws, message):
                dead.append(ws)
        for ws in dead:
            try:
                self._event_connections.remove(ws)
            except ValueError:
                pass


manager = ConnectionManager()
