#!/usr/bin/env python
"""
Workflow Examples Seed Script
──────────────────────────────────────────────────────────────────────────────
워크플로우 시스템 사용 예시를 DB에 생성합니다.

예시 1: 공개 API 조회 + Python 가공  → 즉시 실행 가능 (외부 의존성 없음)
예시 2: 조건 분기 워크플로우          → 즉시 실행 가능
예시 3: DB 배치 처리 템플릿           → SQL 노드에 데이터소스 설정 필요 (draft)

Usage:
    cd /path/to/job-scheduler/backend
    python scripts/seed_workflow_examples.py
"""

import sys
import os
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models.module import StepModule
from app.models.workflow import Workflow


def mk_id() -> str:
    return str(uuid.uuid4())


def upsert_module(db, name: str, **kwargs) -> StepModule:
    """이름으로 조회 후 없으면 생성."""
    m = db.query(StepModule).filter(StepModule.name == name).first()
    if m:
        print(f"  ✓ 모듈 기존: {name}")
        return m
    m = StepModule(id=mk_id(), name=name, **kwargs)
    db.add(m)
    db.flush()
    print(f"  + 모듈 생성: {name}")
    return m


def workflow_exists(db, name: str) -> bool:
    return db.query(Workflow).filter(Workflow.name == name).first() is not None


def main():
    db = SessionLocal()
    try:
        _seed(db)
    finally:
        db.close()


def _seed(db):
    print("=" * 60)
    print("워크플로우 예시 시드 데이터 생성")
    print("=" * 60)

    # ── 공통 모듈 생성 ─────────────────────────────────────────────────────────
    print("\n[1/2] 모듈(라이브러리) 생성...")

    trigger_mod = upsert_module(
        db,
        name="[예시] 워크플로우 시작",
        description="워크플로우 시작 노드. 노드 설정 > Config 탭에서 initial_data를 JSON으로 입력하면 이후 노드들에 초기 데이터를 전달합니다.",
        module_type="trigger",
        category="builtin",
        icon="▶️",
        color="#22c55e",
        executor_type="builtin",
        executor_config={"builtin_type": "trigger"},
        is_builtin=True,
        is_active=True,
    )

    http_mod = upsert_module(
        db,
        name="[예시] HTTP API 호출",
        description="외부 REST API를 호출합니다. 노드 설정에서 URL, 메서드(GET/POST 등), 헤더, 바디를 직접 입력하세요. URL에 {변수명} 형식으로 이전 노드 값을 삽입할 수 있습니다.",
        module_type="action",
        category="http",
        icon="🌐",
        color="#3b82f6",
        executor_type="http",
        executor_config={"method": "GET", "url": "https://jsonplaceholder.typicode.com/users"},
        input_schema={
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "호출할 API URL"},
                "method": {"type": "string", "enum": ["GET", "POST", "PUT", "PATCH", "DELETE"]},
            },
        },
        is_builtin=True,
        is_active=True,
    )

    python_mod = upsert_module(
        db,
        name="[예시] Python 데이터 가공",
        description="Python 코드로 데이터를 변환·분석합니다. input_data 딕셔너리로 이전 노드 출력에 접근하세요. 결과 출력: print(f'__OUTPUT__: {json.dumps(result)}')",
        module_type="action",
        category="transform",
        icon="🐍",
        color="#f59e0b",
        executor_type="python",
        executor_code=(
            "import json\n\n"
            "# input_data: 이전 노드에서 받은 데이터 (dict)\n"
            "result = {\"message\": \"처리 완료\", \"received\": input_data}\n\n"
            "print(f'__OUTPUT__: {json.dumps(result, ensure_ascii=False)}')\n"
        ),
        is_builtin=True,
        is_active=True,
    )

    condition_mod = upsert_module(
        db,
        name="[예시] 조건 분기",
        description="Python 표현식으로 True/False 두 경로로 분기합니다. 노드 설정 > Config 탭의 condition 필드에 표현식을 입력하세요 (예: number >= 50). input_data의 모든 필드를 변수로 사용 가능합니다.",
        module_type="condition",
        category="logic",
        icon="🔀",
        color="#8b5cf6",
        executor_type="builtin",
        executor_config={"builtin_type": "condition"},
        is_builtin=True,
        is_active=True,
    )

    sql_mod = upsert_module(
        db,
        name="[예시] SQL 데이터 조회",
        description="SQL 쿼리로 데이터베이스를 조회합니다. 노드 설정에서 데이터소스를 선택하고 SQL 쿼리를 직접 작성하세요. 결과는 {rows: [...], count: N, columns: [...]} 형식으로 다음 노드에 전달됩니다.",
        module_type="action",
        category="database",
        icon="🗄️",
        color="#06b6d4",
        executor_type="sql",
        executor_code="SELECT 1 AS sample",
        executor_config={},
        is_builtin=True,
        is_active=True,
    )

    db.commit()

    # ── 워크플로우 생성 ────────────────────────────────────────────────────────
    print("\n[2/2] 워크플로우 생성...")

    _create_wf1_api_fetch(db, trigger_mod, http_mod, python_mod)
    _create_wf2_condition_branch(db, trigger_mod, condition_mod, python_mod)
    _create_wf3_db_batch(db, trigger_mod, sql_mod, python_mod)

    db.commit()

    print("\n" + "=" * 60)
    print("✅ 완료!")
    print()
    print("▶ 바로 실행 가능:")
    print("   • [예시 1] 공개 API 조회 + Python 데이터 가공")
    print("   • [예시 2] 숫자 분류기 (조건 분기)")
    print()
    print("⚙ 데이터소스 설정 후 실행:")
    print("   • [예시 3] DB 배치 처리 템플릿")
    print("     → SQL 노드 클릭 > 데이터소스 선택 > 쿼리 입력 후 실행")
    print("=" * 60)


# ─── 예시 1: 공개 API 조회 + Python 데이터 가공 ───────────────────────────────

def _create_wf1_api_fetch(db, trigger_mod, http_mod, python_mod):
    WF_NAME = "[예시 1] 공개 API 조회 + Python 데이터 가공"
    if workflow_exists(db, WF_NAME):
        print(f"  ✓ 워크플로우 기존: {WF_NAME}")
        return

    n_trigger = mk_id()
    n_http    = mk_id()
    n_python  = mk_id()

    canvas = {
        "nodes": [
            {
                "id": n_trigger,
                "type": "workflowNode",
                "position": {"x": 250, "y": 60},
                "data": {
                    "label": "시작",
                    "moduleId": trigger_mod.id,
                    "moduleType": "trigger",
                    # config 내 값들이 이 노드의 출력이 됩니다
                    "config": {
                        "limit": 5,
                        "description": "JSONPlaceholder에서 사용자 5명 조회"
                    },
                    "inputMapping": {},
                },
            },
            {
                "id": n_http,
                "type": "workflowNode",
                "position": {"x": 250, "y": 220},
                "data": {
                    "label": "사용자 목록 API 호출",
                    "moduleId": http_mod.id,
                    "moduleType": "action",
                    # 노드 설정에서 URL·메서드를 직접 수정하세요
                    "config": {
                        "url": "https://jsonplaceholder.typicode.com/users",
                        "method": "GET",
                    },
                    "inputMapping": {},
                },
            },
            {
                "id": n_python,
                "type": "workflowNode",
                "position": {"x": 250, "y": 400},
                "data": {
                    "label": "이름·이메일·회사 추출",
                    "moduleId": python_mod.id,
                    "moduleType": "action",
                    "config": {
                        "code": (
                            "import json\n\n"
                            "# HTTP 노드가 리스트를 반환하면 {'result': [...]} 형태로 옵니다\n"
                            "users = input_data.get('result', [])\n"
                            "if not isinstance(users, list):\n"
                            "    users = [users]\n\n"
                            "# 필요한 필드만 추출\n"
                            "summary = [\n"
                            "    {\n"
                            "        'name':    u.get('name', ''),\n"
                            "        'email':   u.get('email', ''),\n"
                            "        'company': u.get('company', {}).get('name', ''),\n"
                            "        'city':    u.get('address', {}).get('city', ''),\n"
                            "    }\n"
                            "    for u in users\n"
                            "]\n\n"
                            "result = {\n"
                            "    'total': len(summary),\n"
                            "    'users': summary,\n"
                            "    'message': f'총 {len(summary)}명의 사용자를 조회했습니다.'\n"
                            "}\n\n"
                            "print(f'__OUTPUT__: {json.dumps(result, ensure_ascii=False)}')\n"
                        ),
                    },
                    # 이전 HTTP 노드 출력 전체를 input_data로 받습니다
                    "inputMapping": {
                        "result": {
                            "type": "node_output",
                            "nodeId": n_http,
                            "path": "result",
                        }
                    },
                },
            },
        ],
        "edges": [
            {"id": mk_id(), "source": n_trigger, "target": n_http},
            {"id": mk_id(), "source": n_http,    "target": n_python},
        ],
    }

    wf = Workflow(
        id=mk_id(),
        name=WF_NAME,
        description=(
            "JSONPlaceholder(https://jsonplaceholder.typicode.com) 공개 API에서 "
            "사용자 목록을 가져와 Python으로 이름·이메일·회사를 추출합니다.\n\n"
            "✅ 별도 설정 없이 바로 실행 가능합니다.\n\n"
            "💡 확장 아이디어:\n"
            "  • HTTP 노드의 URL을 https://jsonplaceholder.typicode.com/posts 로 바꿔보세요\n"
            "  • Python 노드에 save_output 설정을 추가해 결과를 DB에 저장하세요"
        ),
        canvas_data=canvas,
        status="active",
        is_active=True,
        tags=["예시", "HTTP", "Python", "API", "즉시실행"],
    )
    db.add(wf)
    print(f"  + 워크플로우 생성: {WF_NAME}")


# ─── 예시 2: 숫자 분류기 (조건 분기) ──────────────────────────────────────────

def _create_wf2_condition_branch(db, trigger_mod, condition_mod, python_mod):
    WF_NAME = "[예시 2] 숫자 분류기 (조건 분기)"
    if workflow_exists(db, WF_NAME):
        print(f"  ✓ 워크플로우 기존: {WF_NAME}")
        return

    n_trigger   = mk_id()
    n_condition = mk_id()
    n_high      = mk_id()
    n_low       = mk_id()

    canvas = {
        "nodes": [
            {
                "id": n_trigger,
                "type": "workflowNode",
                "position": {"x": 250, "y": 60},
                "data": {
                    "label": "시작 (숫자 입력)",
                    "moduleId": trigger_mod.id,
                    "moduleType": "trigger",
                    # 💡 number 값을 바꿔서 분기를 테스트하세요 (50 미만 = LOW)
                    "config": {"number": 75},
                    "inputMapping": {},
                },
            },
            {
                "id": n_condition,
                "type": "workflowNode",
                "position": {"x": 250, "y": 230},
                "data": {
                    "label": "50 이상?",
                    "moduleId": condition_mod.id,
                    "moduleType": "condition",
                    # condition 표현식: input_data의 변수를 그대로 사용
                    "config": {"condition": "number >= 50"},
                    "inputMapping": {
                        "number": {
                            "type": "node_output",
                            "nodeId": n_trigger,
                            "path": "number",
                        }
                    },
                },
            },
            {
                "id": n_high,
                "type": "workflowNode",
                "position": {"x": 80, "y": 420},
                "data": {
                    "label": "HIGH 처리 (50 이상)",
                    "moduleId": python_mod.id,
                    "moduleType": "action",
                    "config": {
                        "code": (
                            "import json\n\n"
                            "number = input_data.get('number', 0)\n\n"
                            "result = {\n"
                            "    'category': 'HIGH',\n"
                            "    'number': number,\n"
                            "    'grade': 'A' if number >= 90 else 'B' if number >= 70 else 'C',\n"
                            "    'action': 'HIGH 값 처리 로직을 여기에 작성하세요'\n"
                            "}\n\n"
                            "print(f'__OUTPUT__: {json.dumps(result, ensure_ascii=False)}')\n"
                        ),
                    },
                    "inputMapping": {
                        "number": {
                            "type": "node_output",
                            "nodeId": n_condition,
                            "path": "number",
                        }
                    },
                },
            },
            {
                "id": n_low,
                "type": "workflowNode",
                "position": {"x": 420, "y": 420},
                "data": {
                    "label": "LOW 처리 (50 미만)",
                    "moduleId": python_mod.id,
                    "moduleType": "action",
                    "config": {
                        "code": (
                            "import json\n\n"
                            "number = input_data.get('number', 0)\n\n"
                            "result = {\n"
                            "    'category': 'LOW',\n"
                            "    'number': number,\n"
                            "    'grade': 'D' if number >= 30 else 'F',\n"
                            "    'action': 'LOW 값 처리 로직을 여기에 작성하세요'\n"
                            "}\n\n"
                            "print(f'__OUTPUT__: {json.dumps(result, ensure_ascii=False)}')\n"
                        ),
                    },
                    "inputMapping": {
                        "number": {
                            "type": "node_output",
                            "nodeId": n_condition,
                            "path": "number",
                        }
                    },
                },
            },
        ],
        "edges": [
            {"id": mk_id(), "source": n_trigger,   "target": n_condition},
            # branch 값으로 조건 노드 출력의 _branch 필드와 매칭됩니다
            {"id": mk_id(), "source": n_condition,  "target": n_high, "data": {"branch": "true"}},
            {"id": mk_id(), "source": n_condition,  "target": n_low,  "data": {"branch": "false"}},
        ],
    }

    wf = Workflow(
        id=mk_id(),
        name=WF_NAME,
        description=(
            "숫자 값을 임계값(50)과 비교해 HIGH·LOW 두 경로로 분기 처리합니다.\n\n"
            "✅ 별도 설정 없이 바로 실행 가능합니다.\n\n"
            "💡 테스트 방법:\n"
            "  1. 시작 노드를 클릭하고 Config 탭에서 number 값을 변경하세요\n"
            "  2. 50 이상이면 HIGH 경로, 미만이면 LOW 경로로 실행됩니다\n"
            "  3. 조건 노드의 condition 표현식도 자유롭게 수정 가능합니다"
        ),
        canvas_data=canvas,
        status="active",
        is_active=True,
        tags=["예시", "조건분기", "Python", "즉시실행"],
    )
    db.add(wf)
    print(f"  + 워크플로우 생성: {WF_NAME}")


# ─── 예시 3: DB 배치 처리 템플릿 ───────────────────────────────────────────────

def _create_wf3_db_batch(db, trigger_mod, sql_mod, python_mod):
    WF_NAME = "[예시 3] DB 배치 처리 템플릿"
    if workflow_exists(db, WF_NAME):
        print(f"  ✓ 워크플로우 기존: {WF_NAME}")
        return

    n_trigger = mk_id()
    n_sql     = mk_id()
    n_process = mk_id()
    n_summary = mk_id()

    canvas = {
        "nodes": [
            {
                "id": n_trigger,
                "type": "workflowNode",
                "position": {"x": 250, "y": 60},
                "data": {
                    "label": "배치 시작",
                    "moduleId": trigger_mod.id,
                    "moduleType": "trigger",
                    "config": {
                        "batch_date": "2025-01-01",
                        "limit": 100,
                    },
                    "inputMapping": {},
                },
            },
            {
                "id": n_sql,
                "type": "workflowNode",
                "position": {"x": 250, "y": 230},
                "data": {
                    "label": "데이터 조회 (SQL)",
                    "moduleId": sql_mod.id,
                    "moduleType": "action",
                    # ⚠️  실행 전 이 노드를 클릭해서 데이터소스를 선택하세요
                    "config": {
                        "datasource_id": "",
                        "query": (
                            "-- ⚠️  이 쿼리를 수정하세요\n"
                            "-- 데이터소스 선택 후 실제 테이블명과 컬럼을 입력하세요\n"
                            "SELECT *\n"
                            "FROM your_table\n"
                            "LIMIT 100"
                        ),
                    },
                    "inputMapping": {},
                },
            },
            {
                "id": n_process,
                "type": "workflowNode",
                "position": {"x": 250, "y": 410},
                "data": {
                    "label": "데이터 가공 (Python)",
                    "moduleId": python_mod.id,
                    "moduleType": "action",
                    "config": {
                        "code": (
                            "import json\n"
                            "from datetime import datetime\n\n"
                            "# SQL 노드 결과: {rows: [...], count: N, columns: [...]}\n"
                            "rows = input_data.get('rows', [])\n"
                            "columns = input_data.get('columns', [])\n\n"
                            "# ── 여기서 데이터를 가공하세요 ──────────────────\n"
                            "processed = []\n"
                            "for row in rows:\n"
                            "    item = dict(row)\n"
                            "    # 예: 필드 추가, 변환, 필터링\n"
                            "    item['processed_at'] = datetime.now().isoformat()\n"
                            "    processed.append(item)\n"
                            "# ────────────────────────────────────────────────\n\n"
                            "result = {\n"
                            "    'rows': processed,\n"
                            "    'count': len(processed),\n"
                            "    'columns': columns,\n"
                            "}\n\n"
                            "print(f'__OUTPUT__: {json.dumps(result, ensure_ascii=False, default=str)}')\n"
                        ),
                        # 💡 save_output을 true로 바꾸고 아래 설정을 채우면 DB에 저장됩니다
                        "save_output": False,
                        "output_datasource_id": "",
                        "output_table": "processed_results",
                        "output_write_mode": "append",
                    },
                    "inputMapping": {
                        "rows":    {"type": "node_output", "nodeId": n_sql, "path": "rows"},
                        "columns": {"type": "node_output", "nodeId": n_sql, "path": "columns"},
                    },
                },
            },
            {
                "id": n_summary,
                "type": "workflowNode",
                "position": {"x": 250, "y": 600},
                "data": {
                    "label": "처리 요약",
                    "moduleId": python_mod.id,
                    "moduleType": "action",
                    "config": {
                        "code": (
                            "import json\n\n"
                            "count = input_data.get('count', 0)\n\n"
                            "result = {\n"
                            "    'status': '완료',\n"
                            "    'total_processed': count,\n"
                            "    'summary': f'{count}건의 데이터를 성공적으로 처리했습니다.',\n"
                            "}\n\n"
                            "print(f'__OUTPUT__: {json.dumps(result, ensure_ascii=False)}')\n"
                        ),
                    },
                    "inputMapping": {
                        "count": {"type": "node_output", "nodeId": n_process, "path": "count"},
                    },
                },
            },
        ],
        "edges": [
            {"id": mk_id(), "source": n_trigger, "target": n_sql},
            {"id": mk_id(), "source": n_sql,     "target": n_process},
            {"id": mk_id(), "source": n_process,  "target": n_summary},
        ],
    }

    wf = Workflow(
        id=mk_id(),
        name=WF_NAME,
        description=(
            "DB에서 데이터를 조회하여 Python으로 가공한 뒤 결과를 다른 테이블에 저장하는 배치 처리 템플릿입니다.\n\n"
            "⚙ 실행 전 설정 필요:\n"
            "  1. [데이터 조회] 노드 클릭 → 데이터소스 선택 → SQL 쿼리 작성\n"
            "  2. [데이터 가공] 노드의 Python 코드를 수정해 원하는 변환 로직을 작성하세요\n"
            "  3. (선택) [데이터 가공] 노드에서 save_output = true 설정 후 저장할 테이블 지정\n\n"
            "💡 스케줄 등록:\n"
            "  워크플로우 목록에서 스케줄 버튼을 눌러 cron 표현식으로 자동 실행을 설정하세요"
        ),
        canvas_data=canvas,
        status="draft",  # 설정 필요하므로 draft 상태
        is_active=True,
        tags=["예시", "SQL", "배치처리", "Python", "DB저장", "템플릿"],
    )
    db.add(wf)
    print(f"  + 워크플로우 생성: {WF_NAME}  (status=draft, 데이터소스 설정 필요)")


if __name__ == "__main__":
    main()
