from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from app.websocket.manager import manager
from app.core.security import decode_token

router = APIRouter(tags=["websocket"])


async def authenticate_ws(token: str | None) -> bool:
    if not token:
        return False
    payload = decode_token(token)
    return payload is not None and payload.get("type") == "access"


@router.websocket("/ws/logs/{run_id}")
async def log_stream(websocket: WebSocket, run_id: str, token: str = Query(None)):
    if not await authenticate_ws(token):
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await manager.connect_logs(run_id, websocket)
    try:
        while True:
            # Keep connection alive, handle client messages
            data = await websocket.receive_text()
            # Client can send ping/pong or request backfill
    except WebSocketDisconnect:
        await manager.disconnect_logs(run_id, websocket)


@router.websocket("/ws/events")
async def event_stream(websocket: WebSocket, token: str = Query(None)):
    if not await authenticate_ws(token):
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await manager.connect_events(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect_events(websocket)
