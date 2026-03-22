"""Module service: CRUD + seeding of built-in modules."""
import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.module import StepModule


# ─── CRUD ─────────────────────────────────────────────────────────────────────

def list_modules(db: Session, active_only: bool = True) -> list[StepModule]:
    q = db.query(StepModule)
    if active_only:
        q = q.filter(StepModule.is_active == True)
    return q.order_by(StepModule.module_type, StepModule.name).all()


def get_module(db: Session, module_id: str) -> StepModule:
    m = db.query(StepModule).filter(StepModule.id == module_id).first()
    if not m:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Module not found")
    return m


def create_module(db: Session, data: dict, user_id: str | None = None) -> StepModule:
    m = StepModule(id=str(uuid.uuid4()), created_by=user_id, **data)
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


def update_module(db: Session, module_id: str, data: dict) -> StepModule:
    m = get_module(db, module_id)
    for key, val in data.items():
        if val is not None or key in ("executor_code", "description"):
            setattr(m, key, val)
    m.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(m)
    return m


def delete_module(db: Session, module_id: str):
    m = get_module(db, module_id)
    if m.is_builtin:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Cannot delete a built-in module")
    db.delete(m)
    db.commit()


# ─── Built-in Seed ────────────────────────────────────────────────────────────

BUILTIN_MODULES = [
    {
        "name": "Trigger: Manual",
        "description": "워크플로우의 시작점. 수동 또는 스케줄 실행 시 초기 데이터를 전달합니다.",
        "module_type": "trigger",
        "category": "core",
        "icon": "⚡",
        "color": "#22D3EE",
        "executor_type": "builtin",
        "executor_config": {"builtin_type": "trigger"},
        "input_schema": {},
        "output_schema": {"type": "object", "description": "초기 컨텍스트 데이터"},
        "is_builtin": True,
    },
    {
        "name": "Condition: If/Else",
        "description": "조건식을 평가하여 true 또는 false 경로로 분기합니다.",
        "module_type": "condition",
        "category": "logic",
        "icon": "◇",
        "color": "#F472B6",
        "executor_type": "builtin",
        "executor_config": {"builtin_type": "condition"},
        "input_schema": {
            "type": "object",
            "properties": {
                "condition": {"type": "string", "description": "Python 조건식 (예: value > 10)"}
            }
        },
        "output_schema": {
            "type": "object",
            "properties": {
                "_branch": {"type": "string", "enum": ["true", "false"]}
            }
        },
        "is_builtin": True,
    },
    {
        "name": "Transform: Data Mapper",
        "description": "입력 데이터를 변환하여 새로운 구조로 반환합니다.",
        "module_type": "transform",
        "category": "logic",
        "icon": "⟳",
        "color": "#10B981",
        "executor_type": "python",
        "executor_code": (
            "# input_data에서 필요한 필드를 선택하고 변환합니다\n"
            "# output_data에 결과를 저장하세요\n"
            "output_data = {\n"
            "    key: value\n"
            "    for key, value in input_data.items()\n"
            "}\n"
            "print('__OUTPUT__:' + __json.dumps(output_data))\n"
        ),
        "input_schema": {"type": "object"},
        "output_schema": {"type": "object"},
        "is_builtin": True,
    },
    {
        "name": "Merge: Combine Results",
        "description": "여러 병렬 노드의 결과를 하나의 객체로 합칩니다.",
        "module_type": "merge",
        "category": "logic",
        "icon": "⊕",
        "color": "#A78BFA",
        "executor_type": "builtin",
        "executor_config": {"builtin_type": "merge"},
        "input_schema": {"type": "object"},
        "output_schema": {"type": "object"},
        "is_builtin": True,
    },
    {
        "name": "HTTP Request",
        "description": "외부 API에 HTTP 요청을 보내고 응답을 반환합니다.",
        "module_type": "action",
        "category": "http",
        "icon": "🌐",
        "color": "#F59E0B",
        "executor_type": "http",
        "executor_config": {
            "url": "https://api.example.com/endpoint",
            "method": "POST",
            "headers": {"Content-Type": "application/json"},
        },
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string"},
                "method": {"type": "string", "enum": ["GET", "POST", "PUT", "DELETE", "PATCH"]},
                "body": {"type": "object"},
            }
        },
        "output_schema": {
            "type": "object",
            "properties": {
                "status": {"type": "integer"},
                "body": {"type": "object"},
            }
        },
        "is_builtin": True,
    },
    {
        "name": "SQL Query",
        "description": "데이터소스에서 SQL 쿼리를 실행하고 결과를 반환합니다.",
        "module_type": "data",
        "category": "database",
        "icon": "🗃️",
        "color": "#818CF8",
        "executor_type": "sql",
        "executor_code": "SELECT * FROM table_name LIMIT 100",
        "executor_config": {"datasource_id": None},
        "input_schema": {"type": "object"},
        "output_schema": {
            "type": "object",
            "properties": {
                "rows": {"type": "array"},
                "count": {"type": "integer"},
                "columns": {"type": "array"},
            }
        },
        "is_builtin": True,
    },
    {
        "name": "Slack: Send Message",
        "description": "Slack 채널에 메시지를 발송합니다.",
        "module_type": "action",
        "category": "slack",
        "icon": "💬",
        "color": "#F59E0B",
        "executor_type": "python",
        "executor_code": (
            "import urllib.request\n"
            "import json\n\n"
            "webhook_url = input_data.get('webhook_url', '')\n"
            "message = input_data.get('message', '')\n"
            "channel = input_data.get('channel', '#general')\n\n"
            "payload = json.dumps({'text': message, 'channel': channel}).encode()\n"
            "req = urllib.request.Request(webhook_url, payload, {'Content-Type': 'application/json'})\n"
            "with urllib.request.urlopen(req) as resp:\n"
            "    result = {'status': resp.status, 'sent': True, 'message': message}\n\n"
            "print('__OUTPUT__:' + json.dumps(result))\n"
        ),
        "input_schema": {
            "type": "object",
            "required": ["webhook_url", "message"],
            "properties": {
                "webhook_url": {"type": "string", "description": "Slack Incoming Webhook URL"},
                "message": {"type": "string", "description": "발송할 메시지"},
                "channel": {"type": "string", "description": "채널 (예: #general)"},
            }
        },
        "output_schema": {
            "type": "object",
            "properties": {
                "status": {"type": "integer"},
                "sent": {"type": "boolean"},
                "message": {"type": "string"},
            }
        },
        "is_builtin": True,
    },
    {
        "name": "Python Script",
        "description": "커스텀 Python 코드를 실행합니다. input_data로 이전 노드 데이터에 접근합니다.",
        "module_type": "action",
        "category": "code",
        "icon": "🐍",
        "color": "#10B981",
        "executor_type": "python",
        "executor_code": (
            "# input_data 딕셔너리로 이전 노드의 출력에 접근\n"
            "# 예: name = input_data.get('name', '')\n\n"
            "result = {\n"
            "    'processed': True,\n"
            "    'input_keys': list(input_data.keys()),\n"
            "}\n\n"
            "print('__OUTPUT__:' + __json.dumps(result))\n"
        ),
        "input_schema": {"type": "object"},
        "output_schema": {"type": "object"},
        "is_builtin": True,
    },
]


def seed_builtin_modules(db: Session):
    """Insert built-in modules if they don't exist yet."""
    for mod_data in BUILTIN_MODULES:
        existing = db.query(StepModule).filter(StepModule.name == mod_data["name"]).first()
        if not existing:
            m = StepModule(id=str(uuid.uuid4()), **mod_data)
            db.add(m)
    db.commit()
