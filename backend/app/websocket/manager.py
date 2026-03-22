import json
from fastapi import WebSocket


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
            self._log_connections[run_id].remove(websocket)
            if not self._log_connections[run_id]:
                del self._log_connections[run_id]

    async def connect_events(self, websocket: WebSocket):
        await websocket.accept()
        self._event_connections.append(websocket)

    async def disconnect_events(self, websocket: WebSocket):
        if websocket in self._event_connections:
            self._event_connections.remove(websocket)

    async def broadcast(self, run_id: str, message: dict):
        """Broadcast log message to all connections watching a specific run."""
        connections = self._log_connections.get(run_id, [])
        dead = []
        for ws in connections:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            connections.remove(ws)

    async def broadcast_event(self, message: dict):
        """Broadcast event to all global event connections."""
        dead = []
        for ws in self._event_connections:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._event_connections.remove(ws)


manager = ConnectionManager()
