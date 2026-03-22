#!/usr/bin/env python
"""
Workflow Examples Seed Script v2
──────────────────────────────────────────────────────────────────────────────
실제 연결된 DB (job_scheduler)의 테이블과 모듈을 사용하는 워크플로우 예시.
모든 예시가 바로 실행 가능합니다.

Usage:
    cd /path/to/job-scheduler/backend
    python scripts/seed_workflow_examples.py
"""

import sys
import os
import json
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models.module import StepModule
from app.models.workflow import Workflow


def mk_id() -> str:
    return str(uuid.uuid4())


# ── 실제 모듈 ID (DB에 이미 존재) ──────────────────────────────────────────────
MOD = {
    "trigger":   "ee63da20-27ea-4cac-a5b7-27d3314acad9",  # Trigger: Manual
    "http":      "fc57297a-4541-4f33-97ea-0eea2563297b",  # HTTP Request
    "python":    "71d86fc8-43af-48a1-832d-3a1575d94d40",  # Python Script
    "sql":       "0fe8fbd1-b034-41d3-9108-79626a0e1d6d",  # SQL Query
    "condition": "e5508b14-660c-4211-a325-e15db13275d3",  # Condition: If/Else
    "merge":     "8bae1a05-97f8-435d-98f0-f83538476d92",  # Merge: Combine Results
    "transform": "672ec199-5e46-4187-9490-1bd892bb58f4",  # Transform: Data Mapper
    "html":      "a1b2c3d4-html-4rep-ort0-000000000001",  # HTML Report
}

# 실제 데이터소스 ID
DS_ID = "9c405347-ab86-4136-89f5-757f869cf7c1"  # postgres (localhost:5433/job_scheduler)


def node(nid, x, y, label, mod_key, config=None, input_mapping=None, **extra_data):
    """React Flow 노드 생성 헬퍼."""
    mod_id = MOD[mod_key]
    # module_type 매핑
    type_map = {
        "trigger": "trigger", "http": "action", "python": "action",
        "sql": "data", "condition": "condition", "merge": "merge",
        "transform": "transform", "html": "report",
    }
    # executor_type 매핑
    exec_map = {
        "trigger": "builtin", "http": "http", "python": "python",
        "sql": "sql", "condition": "builtin", "merge": "builtin",
        "transform": "python", "html": "html",
    }
    return {
        "id": nid,
        "type": "workflowNode",
        "position": {"x": x, "y": y},
        "data": {
            "label": label,
            "moduleId": mod_id,
            "moduleType": type_map[mod_key],
            "executorType": exec_map[mod_key],
            "config": config or {},
            "inputMapping": input_mapping or {},
            **extra_data,
        },
    }


def edge(src, tgt, src_handle=None, data=None):
    """React Flow 엣지 생성 헬퍼."""
    e = {"id": mk_id(), "type": "deletable", "source": src, "target": tgt}
    if src_handle:
        e["sourceHandle"] = src_handle
    if data:
        e["data"] = data
    return e


def inp(node_id, path):
    """inputMapping 값 헬퍼."""
    return {"type": "node_output", "nodeId": node_id, "path": path}


# ── 워크플로우 정의 ────────────────────────────────────────────────────────────

def wf1_job_stats():
    """예시 1: 작업 실행 통계 대시보드 — jobs, job_runs 테이블 분석."""
    n1 = mk_id()  # trigger
    n2 = mk_id()  # sql - 작업별 실행 통계
    n3 = mk_id()  # python - 분석

    nodes = [
        node(n1, 250, 50, "시작", "trigger",
             config={"description": "작업 실행 통계를 조회합니다"}),
        node(n2, 250, 200, "작업별 실행 통계 조회", "sql",
             config={
                 "datasource_id": DS_ID,
                 "query": """SELECT
    j.name AS job_name,
    COUNT(jr.id) AS total_runs,
    COUNT(CASE WHEN jr.status = 'success' THEN 1 END) AS success_count,
    COUNT(CASE WHEN jr.status = 'failed' THEN 1 END) AS fail_count,
    ROUND(AVG(jr.duration_ms)) AS avg_duration_ms,
    MAX(jr.started_at) AS last_run
FROM jobs j
LEFT JOIN job_runs jr ON j.id = jr.job_id
GROUP BY j.id, j.name
ORDER BY total_runs DESC"""
             }),
        node(n3, 250, 400, "성공률 분석 + 리포트", "python",
             config={
                 "code": """import json

rows = input_data.get('rows', [])
total_jobs = len(rows)
total_runs = sum(r.get('total_runs', 0) for r in rows)
total_success = sum(r.get('success_count', 0) for r in rows)
total_fail = sum(r.get('fail_count', 0) for r in rows)
success_rate = round(total_success / total_runs * 100, 1) if total_runs > 0 else 0

# 작업별 성공률
job_reports = []
for r in rows:
    runs = r.get('total_runs', 0)
    rate = round(r['success_count'] / runs * 100, 1) if runs > 0 else 0
    job_reports.append({
        'job': r['job_name'],
        'runs': runs,
        'success_rate': f"{rate}%",
        'avg_duration': f"{r.get('avg_duration_ms', 0)}ms",
        'last_run': str(r.get('last_run', 'N/A'))
    })

result = {
    'summary': {
        'total_jobs': total_jobs,
        'total_runs': total_runs,
        'overall_success_rate': f"{success_rate}%",
        'total_failures': total_fail
    },
    'jobs': job_reports
}
"""
             },
             input_mapping={
                 "rows": inp(n2, "rows"),
                 "count": inp(n2, "count"),
             }),
    ]
    edges = [edge(n1, n2), edge(n2, n3)]

    return {
        "name": "[예시 1] 작업 실행 통계 대시보드",
        "description": "jobs + job_runs 테이블을 조인하여 작업별 실행 통계를 분석합니다.\n\n"
                       "1. SQL로 작업별 성공/실패/평균 소요시간 조회\n"
                       "2. Python으로 전체 성공률 + 작업별 리포트 생성\n\n"
                       "✅ 바로 실행 가능합니다.",
        "canvas_data": {"nodes": nodes, "edges": edges},
        "status": "active",
        "tags": ["예시", "SQL", "통계", "즉시실행"],
    }


def wf2_recent_failures():
    """예시 2: 최근 실패 작업 감지 + 조건 분기."""
    n1 = mk_id()
    n2 = mk_id()  # sql - 최근 1시간 실패 조회
    n3 = mk_id()  # python - 분석
    n4 = mk_id()  # condition - 실패 있음?
    n5 = mk_id()  # python - 경고 리포트
    n6 = mk_id()  # python - 정상 리포트

    nodes = [
        node(n1, 300, 50, "시작", "trigger",
             config={"description": "최근 실패한 작업을 감지합니다"}),
        node(n2, 300, 200, "최근 실패 조회", "sql",
             config={
                 "datasource_id": DS_ID,
                 "query": """SELECT
    jr.id AS run_id,
    j.name AS job_name,
    jr.status,
    jr.error_message,
    jr.started_at,
    jr.duration_ms
FROM job_runs jr
JOIN jobs j ON j.id = jr.job_id
WHERE jr.status = 'failed'
ORDER BY jr.started_at DESC
LIMIT 10"""
             }),
        node(n3, 300, 380, "실패 분석", "python",
             config={
                 "code": """import json

rows = input_data.get('rows', [])
fail_count = len(rows)

# 작업별 실패 횟수 집계
job_fails = {}
for r in rows:
    name = r.get('job_name', 'unknown')
    job_fails[name] = job_fails.get(name, 0) + 1

result = {
    'fail_count': fail_count,
    'has_failures': fail_count > 0,
    'job_failures': job_fails,
    'recent_errors': [
        {'job': r['job_name'], 'error': r.get('error_message', '')[:100], 'at': str(r.get('started_at', ''))}
        for r in rows[:5]
    ]
}
"""
             },
             input_mapping={
                 "rows": inp(n2, "rows"),
             }),
        node(n4, 300, 560, "실패 있음?", "condition",
             config={
                 "condition_type": "expression",
                 "expression": "input_data.get('has_failures', False) == True"
             },
             input_mapping={
                 "has_failures": inp(n3, "has_failures"),
                 "fail_count": inp(n3, "fail_count"),
             }),
        node(n5, 100, 740, "⚠ 실패 경고 리포트", "python",
             config={
                 "code": """import json

fail_count = input_data.get('fail_count', 0)
job_failures = input_data.get('job_failures', {})
recent_errors = input_data.get('recent_errors', [])

result = {
    'status': 'WARNING',
    'message': f'최근 실패 작업 {fail_count}건 감지!',
    'details': job_failures,
    'recent_errors': recent_errors,
    'recommendation': '실패한 작업의 코드와 로그를 확인하세요.'
}
"""
             },
             input_mapping={
                 "fail_count": inp(n3, "fail_count"),
                 "job_failures": inp(n3, "job_failures"),
                 "recent_errors": inp(n3, "recent_errors"),
             }),
        node(n6, 500, 740, "✅ 정상 리포트", "python",
             config={
                 "code": """result = {
    'status': 'OK',
    'message': '최근 실패한 작업이 없습니다.',
    'recommendation': '모든 작업이 정상 실행 중입니다.'
}
"""
             }),
    ]
    edges = [
        edge(n1, n2),
        edge(n2, n3),
        edge(n3, n4),
        edge(n4, n5, src_handle="true", data={"branch": "true"}),
        edge(n4, n6, src_handle="false", data={"branch": "false"}),
    ]

    return {
        "name": "[예시 2] 실패 작업 감지 + 조건 분기",
        "description": "최근 실패한 작업을 조회하고 실패 여부에 따라 분기합니다.\n\n"
                       "1. SQL로 최근 실패 job_runs 조회\n"
                       "2. Python으로 작업별 실패 횟수 집계\n"
                       "3. 실패 존재 → 경고 리포트 / 없음 → 정상 리포트\n\n"
                       "✅ 바로 실행 가능합니다.",
        "canvas_data": {"nodes": nodes, "edges": edges},
        "status": "active",
        "tags": ["예시", "SQL", "조건분기", "모니터링", "즉시실행"],
    }


def wf3_table_size_monitor():
    """예시 3: 테이블 크기 모니터링."""
    n1 = mk_id()
    n2 = mk_id()  # sql - 테이블 크기
    n3 = mk_id()  # python - 분석
    n4 = mk_id()  # condition

    nodes = [
        node(n1, 300, 50, "시작", "trigger",
             config={"description": "DB 테이블 크기를 모니터링합니다"}),
        node(n2, 300, 200, "테이블 크기 조회", "sql",
             config={
                 "datasource_id": DS_ID,
                 "query": """SELECT
    relname AS table_name,
    pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
    pg_total_relation_size(relid) AS size_bytes,
    n_live_tup AS row_count
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC"""
             }),
        node(n3, 300, 400, "크기 분석", "python",
             config={
                 "code": """import json

rows = input_data.get('rows', [])
total_bytes = sum(r.get('size_bytes', 0) for r in rows)
table_count = len(rows)

# 가장 큰 테이블 TOP 5
top_tables = [
    {
        'table': r['table_name'],
        'size': r['total_size'],
        'rows': r['row_count'],
        'size_bytes': r['size_bytes']
    }
    for r in rows[:5]
]

# 1MB 이상 테이블 체크
large_tables = [t for t in top_tables if t['size_bytes'] > 1_000_000]
has_large = len(large_tables) > 0

def fmt_bytes(b):
    for unit in ['B', 'KB', 'MB', 'GB']:
        if b < 1024: return f"{b:.1f} {unit}"
        b /= 1024
    return f"{b:.1f} TB"

result = {
    'total_db_size': fmt_bytes(total_bytes),
    'table_count': table_count,
    'has_large_tables': has_large,
    'top_tables': top_tables,
    'large_tables': large_tables
}
"""
             },
             input_mapping={
                 "rows": inp(n2, "rows"),
             }),
        node(n4, 300, 620, "대용량 테이블 있음?", "condition",
             config={
                 "condition_type": "expression",
                 "expression": "input_data.get('has_large_tables', False) == True"
             },
             input_mapping={
                 "has_large_tables": inp(n3, "has_large_tables"),
             }),
    ]
    edges = [edge(n1, n2), edge(n2, n3), edge(n3, n4)]

    return {
        "name": "[예시 3] DB 테이블 크기 모니터링",
        "description": "PostgreSQL 테이블 크기를 조회하고 대용량 테이블을 감지합니다.\n\n"
                       "1. pg_stat_user_tables에서 테이블별 크기 + 행 수 조회\n"
                       "2. Python으로 TOP 5 분석 + 1MB 이상 대용량 감지\n"
                       "3. 대용량 테이블 존재 여부로 분기\n\n"
                       "✅ 바로 실행 가능합니다.",
        "canvas_data": {"nodes": nodes, "edges": edges},
        "status": "active",
        "tags": ["예시", "SQL", "모니터링", "즉시실행"],
    }


def wf4_etl_pipeline():
    """예시 4: ETL — job_runs에서 추출 → 가공 → 결과 테이블에 저장."""
    n1 = mk_id()
    n2 = mk_id()  # sql - extract
    n3 = mk_id()  # python - transform
    n4 = mk_id()  # python - load summary

    nodes = [
        node(n1, 250, 50, "ETL 시작", "trigger",
             config={"description": "job_runs → 일별 통계 ETL"}),
        node(n2, 250, 220, "Extract: 실행 이력 조회", "sql",
             config={
                 "datasource_id": DS_ID,
                 "query": """SELECT
    jr.status,
    j.name AS job_name,
    jr.duration_ms,
    jr.started_at::date AS run_date,
    jr.trigger_type,
    jr.error_message
FROM job_runs jr
JOIN jobs j ON j.id = jr.job_id
ORDER BY jr.started_at DESC"""
             }),
        node(n3, 250, 440, "Transform: 일별 집계", "python",
             config={
                 "code": """import json
from collections import defaultdict

rows = input_data.get('rows', [])

# 일별, 작업별 집계
daily = defaultdict(lambda: {'total': 0, 'success': 0, 'failed': 0, 'total_ms': 0})
for r in rows:
    date = str(r.get('run_date', 'unknown'))
    daily[date]['total'] += 1
    daily[date]['total_ms'] += r.get('duration_ms', 0) or 0
    if r.get('status') == 'success':
        daily[date]['success'] += 1
    elif r.get('status') == 'failed':
        daily[date]['failed'] += 1

# 정리
summary = []
for date, stats in sorted(daily.items(), reverse=True):
    rate = round(stats['success'] / stats['total'] * 100, 1) if stats['total'] > 0 else 0
    avg_ms = round(stats['total_ms'] / stats['total']) if stats['total'] > 0 else 0
    summary.append({
        'date': date,
        'total_runs': stats['total'],
        'success_count': stats['success'],
        'fail_count': stats['failed'],
        'success_rate': f"{rate}%",
        'avg_duration_ms': avg_ms
    })

result = {
    'etl_status': 'completed',
    'total_records_processed': len(rows),
    'daily_summary': summary,
    'date_range': {
        'from': summary[-1]['date'] if summary else None,
        'to': summary[0]['date'] if summary else None
    }
}
"""
             },
             input_mapping={
                 "rows": inp(n2, "rows"),
                 "count": inp(n2, "count"),
             }),
        node(n4, 250, 680, "Load: ETL 결과 출력", "python",
             config={
                 "code": """import json

summary = input_data.get('daily_summary', [])
total = input_data.get('total_records_processed', 0)
date_range = input_data.get('date_range', {})

result = {
    'report': f"ETL 완료: {total}건 처리, {len(summary)}일 집계",
    'date_range': date_range,
    'daily_summary': summary
}
"""
             },
             input_mapping={
                 "daily_summary": inp(n3, "daily_summary"),
                 "total_records_processed": inp(n3, "total_records_processed"),
                 "date_range": inp(n3, "date_range"),
             }),
    ]
    edges = [edge(n1, n2), edge(n2, n3), edge(n3, n4)]

    return {
        "name": "[예시 4] ETL 파이프라인 (실행이력 → 일별통계)",
        "description": "전형적인 ETL(Extract-Transform-Load) 파이프라인입니다.\n\n"
                       "1. Extract: job_runs + jobs 조인으로 실행 이력 추출\n"
                       "2. Transform: Python으로 일별 성공률/평균시간 집계\n"
                       "3. Load: 최종 ETL 리포트 생성\n\n"
                       "✅ 바로 실행 가능합니다.",
        "canvas_data": {"nodes": nodes, "edges": edges},
        "status": "active",
        "tags": ["예시", "ETL", "SQL", "Python", "즉시실행"],
    }


def wf5_multi_api_merge():
    """예시 5: 외부 API 2개 병렬 호출 → 병합 → 조건 분기."""
    n1 = mk_id()
    n_users = mk_id()
    n_posts = mk_id()
    n_merge = mk_id()
    n_analyze = mk_id()
    n_cond = mk_id()
    n_active = mk_id()
    n_inactive = mk_id()

    nodes = [
        node(n1, 350, 50, "시작", "trigger",
             config={"description": "Users + Posts API 병합 분석"}),
        node(n_users, 150, 220, "Users API", "http",
             config={"url": "https://jsonplaceholder.typicode.com/users", "method": "GET"}),
        node(n_posts, 550, 220, "Posts API", "http",
             config={"url": "https://jsonplaceholder.typicode.com/posts", "method": "GET"}),
        node(n_merge, 350, 400, "결과 병합", "merge",
             config={},
             input_mapping={
                 "users": inp(n_users, "result"),
                 "posts": inp(n_posts, "result"),
             }),
        node(n_analyze, 350, 580, "사용자별 게시글 분석", "python",
             config={
                 "code": """import json

users = input_data.get('users', [])
posts = input_data.get('posts', [])

if not isinstance(users, list): users = []
if not isinstance(posts, list): posts = []

# 사용자별 게시글 수 집계
post_counts = {}
for p in posts:
    uid = p.get('userId')
    post_counts[uid] = post_counts.get(uid, 0) + 1

# 사용자 + 게시글 수 결합
enriched = []
for u in users:
    uid = u.get('id')
    cnt = post_counts.get(uid, 0)
    enriched.append({
        'name': u.get('name'),
        'email': u.get('email'),
        'company': u.get('company', {}).get('name', ''),
        'post_count': cnt,
        'is_active_writer': cnt >= 5
    })

active_writers = [u for u in enriched if u['is_active_writer']]
has_active = len(active_writers) > 3

result = {
    'total_users': len(users),
    'total_posts': len(posts),
    'has_many_active': has_active,
    'active_writer_count': len(active_writers),
    'user_summary': enriched[:5]
}
"""
             },
             input_mapping={
                 "users": inp(n_merge, "users"),
                 "posts": inp(n_merge, "posts"),
             }),
        node(n_cond, 350, 790, "활성 작성자 많음?", "condition",
             config={
                 "condition_type": "expression",
                 "expression": "input_data.get('has_many_active', False) == True"
             },
             input_mapping={
                 "has_many_active": inp(n_analyze, "has_many_active"),
             }),
        node(n_active, 150, 960, "📊 활성 커뮤니티 리포트", "python",
             config={
                 "code": """import json
count = input_data.get('active_writer_count', 0)
users = input_data.get('user_summary', [])
result = {
    'status': 'ACTIVE_COMMUNITY',
    'message': f'활발한 커뮤니티! 활성 작성자 {count}명',
    'top_writers': users
}
"""
             },
             input_mapping={
                 "active_writer_count": inp(n_analyze, "active_writer_count"),
                 "user_summary": inp(n_analyze, "user_summary"),
             }),
        node(n_inactive, 550, 960, "📉 저활동 리포트", "python",
             config={
                 "code": """import json
count = input_data.get('active_writer_count', 0)
result = {
    'status': 'LOW_ACTIVITY',
    'message': f'활동이 적습니다. 활성 작성자 {count}명뿐',
    'recommendation': '커뮤니티 활성화 캠페인을 고려하세요.'
}
"""
             },
             input_mapping={
                 "active_writer_count": inp(n_analyze, "active_writer_count"),
             }),
    ]
    edges = [
        edge(n1, n_users),
        edge(n1, n_posts),
        edge(n_users, n_merge),
        edge(n_posts, n_merge),
        edge(n_merge, n_analyze),
        edge(n_analyze, n_cond),
        edge(n_cond, n_active, src_handle="true", data={"branch": "true"}),
        edge(n_cond, n_inactive, src_handle="false", data={"branch": "false"}),
    ]

    return {
        "name": "[예시 5] 다중 API 병합 + 커뮤니티 분석",
        "description": "두 개의 외부 API를 병렬 호출하고 결과를 병합 분석합니다.\n\n"
                       "1. Users API + Posts API 동시 호출\n"
                       "2. Merge 노드로 결과 병합\n"
                       "3. Python으로 사용자별 게시글 수 집계\n"
                       "4. 활성 작성자 수에 따라 분기\n\n"
                       "✅ 바로 실행 가능합니다. (JSONPlaceholder API)",
        "canvas_data": {"nodes": nodes, "edges": edges},
        "status": "active",
        "tags": ["예시", "HTTP", "Merge", "조건분기", "즉시실행"],
    }


def wf6_data_quality():
    """예시 6: 데이터 품질 점검 — NULL, 중복 병렬 체크 후 점수 계산."""
    n1 = mk_id()
    n_null = mk_id()
    n_dup = mk_id()
    n_merge = mk_id()
    n_score = mk_id()
    n_cond = mk_id()
    n_pass = mk_id()
    n_fail = mk_id()

    nodes = [
        node(n1, 350, 50, "품질 점검 시작", "trigger",
             config={"description": "job_runs 테이블 데이터 품질 점검"}),
        node(n_null, 150, 220, "NULL 비율 점검", "sql",
             config={
                 "datasource_id": DS_ID,
                 "query": """SELECT
    COUNT(*) AS total_rows,
    COUNT(*) FILTER (WHERE error_message IS NULL) AS null_error_count,
    COUNT(*) FILTER (WHERE duration_ms IS NULL) AS null_duration_count,
    COUNT(*) FILTER (WHERE finished_at IS NULL) AS null_finished_count,
    ROUND(COUNT(*) FILTER (WHERE error_message IS NULL)::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS null_error_pct
FROM job_runs"""
             }),
        node(n_dup, 550, 220, "중복 데이터 점검", "sql",
             config={
                 "datasource_id": DS_ID,
                 "query": """SELECT
    COUNT(*) AS total_rows,
    COUNT(DISTINCT job_id || '::' || COALESCE(started_at::text, '')) AS unique_runs,
    COUNT(*) - COUNT(DISTINCT job_id || '::' || COALESCE(started_at::text, '')) AS duplicate_count
FROM job_runs"""
             }),
        node(n_merge, 350, 420, "결과 병합", "merge",
             config={},
             input_mapping={
                 "null_check": inp(n_null, "rows"),
                 "dup_check": inp(n_dup, "rows"),
             }),
        node(n_score, 350, 600, "품질 점수 계산", "python",
             config={
                 "code": """import json

null_data = input_data.get('null_check', [{}])
dup_data = input_data.get('dup_check', [{}])

null_row = null_data[0] if null_data else {}
dup_row = dup_data[0] if dup_data else {}

total = null_row.get('total_rows', 0)
null_pct = float(null_row.get('null_error_pct', 0) or 0)
dup_count = dup_row.get('duplicate_count', 0) or 0
dup_pct = round(dup_count / total * 100, 1) if total > 0 else 0

# 품질 점수 (100점 만점)
score = 100
# NULL이 많으면 감점하지 않음 (error_message는 성공 시 NULL이 정상)
# 대신 duration_ms NULL 체크
null_duration = null_row.get('null_duration_count', 0) or 0
null_dur_pct = round(null_duration / total * 100, 1) if total > 0 else 0
score -= min(30, null_dur_pct)  # duration NULL 비율만큼 감점 (최대 30점)
score -= min(30, dup_pct * 3)    # 중복 비율의 3배 감점 (최대 30점)
score = max(0, round(score))

is_passing = score >= 80

result = {
    'quality_score': score,
    'is_passing': is_passing,
    'total_rows': total,
    'null_analysis': {
        'null_duration_pct': f"{null_dur_pct}%",
        'null_finished_count': null_row.get('null_finished_count', 0)
    },
    'duplicate_analysis': {
        'duplicate_count': dup_count,
        'duplicate_pct': f"{dup_pct}%"
    },
    'grade': 'A' if score >= 90 else 'B' if score >= 80 else 'C' if score >= 60 else 'F'
}
"""
             },
             input_mapping={
                 "null_check": inp(n_merge, "null_check"),
                 "dup_check": inp(n_merge, "dup_check"),
             }),
        node(n_cond, 350, 810, "품질 통과?", "condition",
             config={
                 "condition_type": "expression",
                 "expression": "input_data.get('is_passing', False) == True"
             },
             input_mapping={
                 "is_passing": inp(n_score, "is_passing"),
             }),
        node(n_pass, 150, 990, "✅ PASS", "python",
             config={
                 "code": """import json
score = input_data.get('quality_score', 0)
grade = input_data.get('grade', '?')
result = {
    'status': 'PASS',
    'message': f'데이터 품질 양호! 점수: {score}/100 (등급: {grade})',
    'score': score,
    'grade': grade
}
"""
             },
             input_mapping={
                 "quality_score": inp(n_score, "quality_score"),
                 "grade": inp(n_score, "grade"),
             }),
        node(n_fail, 550, 990, "❌ FAIL", "python",
             config={
                 "code": """import json
score = input_data.get('quality_score', 0)
grade = input_data.get('grade', '?')
null_info = input_data.get('null_analysis', {})
dup_info = input_data.get('duplicate_analysis', {})
result = {
    'status': 'FAIL',
    'message': f'데이터 품질 미달! 점수: {score}/100 (등급: {grade})',
    'issues': {
        'null_analysis': null_info,
        'duplicate_analysis': dup_info
    },
    'recommendation': 'NULL 값과 중복 데이터를 정리하세요.'
}
"""
             },
             input_mapping={
                 "quality_score": inp(n_score, "quality_score"),
                 "grade": inp(n_score, "grade"),
                 "null_analysis": inp(n_score, "null_analysis"),
                 "duplicate_analysis": inp(n_score, "duplicate_analysis"),
             }),
    ]
    edges = [
        edge(n1, n_null),
        edge(n1, n_dup),
        edge(n_null, n_merge),
        edge(n_dup, n_merge),
        edge(n_merge, n_score),
        edge(n_score, n_cond),
        edge(n_cond, n_pass, src_handle="true", data={"branch": "true"}),
        edge(n_cond, n_fail, src_handle="false", data={"branch": "false"}),
    ]

    return {
        "name": "[예시 6] 데이터 품질 모니터링 (병렬 점검)",
        "description": "job_runs 테이블의 데이터 품질을 자동 점검합니다.\n\n"
                       "1. NULL 비율 점검 + 중복 데이터 점검 (병렬 실행)\n"
                       "2. Merge로 결과 병합 → 품질 점수 계산 (100점 만점)\n"
                       "3. 80점 이상 PASS / 미만 FAIL 분기\n\n"
                       "✅ 바로 실행 가능합니다.",
        "canvas_data": {"nodes": nodes, "edges": edges},
        "status": "active",
        "tags": ["예시", "SQL", "Merge", "데이터품질", "조건분기", "즉시실행"],
    }


def wf7_workflow_meta():
    """예시 7: 워크플로우 메타 분석 — 자기 자신의 워크플로우 현황 조회."""
    n1 = mk_id()
    n2 = mk_id()  # sql - 워크플로우 목록
    n3 = mk_id()  # sql - 워크플로우 실행 통계
    n4 = mk_id()  # merge
    n5 = mk_id()  # python - 분석

    nodes = [
        node(n1, 350, 50, "시작", "trigger",
             config={"description": "워크플로우 시스템 자체 현황 분석"}),
        node(n2, 150, 220, "워크플로우 목록 조회", "sql",
             config={
                 "datasource_id": DS_ID,
                 "query": """SELECT
    id, name, status, is_active,
    schedule_type, tags,
    created_at
FROM workflows
ORDER BY created_at DESC"""
             }),
        node(n3, 550, 220, "실행 이력 통계", "sql",
             config={
                 "datasource_id": DS_ID,
                 "query": """SELECT
    w.name AS workflow_name,
    COUNT(wr.id) AS run_count,
    COUNT(CASE WHEN wr.status = 'success' THEN 1 END) AS success_count,
    COUNT(CASE WHEN wr.status = 'failed' THEN 1 END) AS fail_count,
    MAX(wr.started_at) AS last_run
FROM workflows w
LEFT JOIN workflow_runs wr ON w.id = wr.workflow_id
GROUP BY w.id, w.name
ORDER BY run_count DESC"""
             }),
        node(n4, 350, 420, "결과 병합", "merge",
             config={},
             input_mapping={
                 "workflows": inp(n2, "rows"),
                 "run_stats": inp(n3, "rows"),
             }),
        node(n5, 350, 620, "현황 리포트 생성", "python",
             config={
                 "code": """import json

workflows = input_data.get('workflows', [])
run_stats = input_data.get('run_stats', [])

total_wf = len(workflows)
active_wf = len([w for w in workflows if w.get('status') == 'active'])
draft_wf = len([w for w in workflows if w.get('status') == 'draft'])

total_runs = sum(r.get('run_count', 0) for r in run_stats)
total_success = sum(r.get('success_count', 0) for r in run_stats)
success_rate = round(total_success / total_runs * 100, 1) if total_runs > 0 else 0

# 가장 많이 실행된 워크플로우
most_run = sorted(run_stats, key=lambda x: x.get('run_count', 0), reverse=True)[:3]

result = {
    'system_overview': {
        'total_workflows': total_wf,
        'active': active_wf,
        'draft': draft_wf,
        'total_runs': total_runs,
        'success_rate': f"{success_rate}%"
    },
    'most_executed': [
        {'name': r['workflow_name'], 'runs': r['run_count'], 'success': r['success_count']}
        for r in most_run
    ],
    'workflow_list': [
        {'name': w['name'], 'status': w['status'], 'schedule': w.get('schedule_type', 'manual')}
        for w in workflows[:10]
    ]
}
"""
             },
             input_mapping={
                 "workflows": inp(n4, "workflows"),
                 "run_stats": inp(n4, "run_stats"),
             }),
    ]
    edges = [
        edge(n1, n2),
        edge(n1, n3),
        edge(n2, n4),
        edge(n3, n4),
        edge(n4, n5),
    ]

    return {
        "name": "[예시 7] 워크플로우 시스템 현황 분석",
        "description": "워크플로우 시스템 자체의 현황을 메타 분석합니다.\n\n"
                       "1. workflows 테이블에서 전체 목록 조회\n"
                       "2. workflow_runs에서 실행 통계 조회 (병렬)\n"
                       "3. Merge → Python으로 시스템 현황 리포트 생성\n\n"
                       "✅ 바로 실행 가능합니다. (자기 자신을 분석하는 메타 워크플로우!)",
        "canvas_data": {"nodes": nodes, "edges": edges},
        "status": "active",
        "tags": ["예시", "SQL", "Merge", "메타분석", "즉시실행"],
    }


def wf8_cross_api_sync():
    """예시 8: 외부 API + DB 크로스 분석."""
    n1 = mk_id()
    n_api = mk_id()   # http - 외부 사용자
    n_db = mk_id()    # sql - 내부 작업 목록
    n_merge = mk_id()
    n_analyze = mk_id()

    nodes = [
        node(n1, 350, 50, "시작", "trigger",
             config={"description": "외부 API + 내부 DB 크로스 분석"}),
        node(n_api, 150, 220, "외부 사용자 API", "http",
             config={"url": "https://jsonplaceholder.typicode.com/users", "method": "GET"}),
        node(n_db, 550, 220, "내부 작업 목록 조회", "sql",
             config={
                 "datasource_id": DS_ID,
                 "query": """SELECT
    j.name,
    j.schedule_type,
    j.is_active,
    COUNT(jr.id) AS run_count,
    MAX(jr.started_at) AS last_run
FROM jobs j
LEFT JOIN job_runs jr ON j.id = jr.job_id
GROUP BY j.id, j.name, j.schedule_type, j.is_active
ORDER BY j.name"""
             }),
        node(n_merge, 350, 420, "결과 병합", "merge",
             config={},
             input_mapping={
                 "external_users": inp(n_api, "result"),
                 "internal_jobs": inp(n_db, "rows"),
             }),
        node(n_analyze, 350, 620, "크로스 분석 리포트", "python",
             config={
                 "code": """import json

ext_users = input_data.get('external_users', [])
int_jobs = input_data.get('internal_jobs', [])

if not isinstance(ext_users, list): ext_users = []

# 외부 데이터 요약
ext_companies = {}
for u in ext_users:
    co = u.get('company', {}).get('name', 'unknown')
    ext_companies[co] = ext_companies.get(co, 0) + 1

# 내부 데이터 요약
active_jobs = [j for j in int_jobs if j.get('is_active')]
total_runs = sum(j.get('run_count', 0) for j in int_jobs)

result = {
    'cross_analysis': {
        'external': {
            'total_users': len(ext_users),
            'companies': ext_companies,
            'top_domains': list(set(
                u.get('email', '').split('@')[-1] for u in ext_users if '@' in u.get('email', '')
            ))[:5]
        },
        'internal': {
            'total_jobs': len(int_jobs),
            'active_jobs': len(active_jobs),
            'total_runs': total_runs,
            'job_list': [
                {'name': j['name'], 'runs': j['run_count'], 'active': j['is_active']}
                for j in int_jobs
            ]
        },
        'comparison': {
            'external_entities': len(ext_users),
            'internal_entities': len(int_jobs),
            'data_ratio': f"{len(ext_users)}:{len(int_jobs)}"
        }
    }
}
"""
             },
             input_mapping={
                 "external_users": inp(n_merge, "external_users"),
                 "internal_jobs": inp(n_merge, "internal_jobs"),
             }),
    ]
    edges = [
        edge(n1, n_api),
        edge(n1, n_db),
        edge(n_api, n_merge),
        edge(n_db, n_merge),
        edge(n_merge, n_analyze),
    ]

    return {
        "name": "[예시 8] 외부 API + 내부 DB 크로스 분석",
        "description": "외부 API와 내부 DB 데이터를 동시에 조회하여 크로스 분석합니다.\n\n"
                       "1. 외부: JSONPlaceholder Users API 호출\n"
                       "2. 내부: jobs + job_runs 테이블 조회 (병렬)\n"
                       "3. Merge → Python으로 외부/내부 데이터 비교 리포트\n\n"
                       "✅ 바로 실행 가능합니다.",
        "canvas_data": {"nodes": nodes, "edges": edges},
        "status": "active",
        "tags": ["예시", "HTTP", "SQL", "Merge", "크로스분석", "즉시실행"],
    }


def wf9_html_report():
    """예시 9: 작업 실행 현황 HTML 리포트 — SQL 조회 → HTML 렌더링."""
    n1 = mk_id()   # trigger
    n2 = mk_id()   # sql - 작업별 통계
    n3 = mk_id()   # sql - 최근 실패
    n4 = mk_id()   # merge
    n5 = mk_id()   # html report

    html_template = """<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>{{ title }}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #0f172a; color: #e2e8f0; padding: 40px; }
    .container { max-width: 1000px; margin: 0 auto; }
    h1 { font-size: 28px; font-weight: 800; color: #f1f5f9;
         background: linear-gradient(135deg, #10b981, #06b6d4);
         -webkit-background-clip: text; -webkit-text-fill-color: transparent;
         margin-bottom: 8px; }
    .subtitle { color: #64748b; font-size: 14px; margin-bottom: 32px; }
    .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                 gap: 16px; margin-bottom: 32px; }
    .stat { background: #1e293b; border-radius: 16px; padding: 24px;
            border: 1px solid #334155; }
    .stat-value { font-size: 32px; font-weight: 800; color: #f1f5f9; }
    .stat-label { font-size: 12px; color: #64748b; margin-top: 4px;
                  text-transform: uppercase; letter-spacing: 0.08em; }
    .card { background: #1e293b; border-radius: 16px; padding: 24px;
            border: 1px solid #334155; margin-bottom: 24px; }
    .card h2 { font-size: 18px; font-weight: 700; color: #f1f5f9; margin-bottom: 16px;
               display: flex; align-items: center; gap: 8px; }
    .card h2 .icon { font-size: 20px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 12px 16px; background: #0f172a;
         font-size: 11px; font-weight: 700; color: #94a3b8;
         text-transform: uppercase; letter-spacing: 0.08em; }
    td { padding: 12px 16px; border-bottom: 1px solid #1e293b; font-size: 14px;
         color: #cbd5e1; }
    tr:hover td { background: rgba(148, 163, 184, 0.05); }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 999px;
             font-size: 12px; font-weight: 600; }
    .badge-success { background: rgba(16, 185, 129, 0.15); color: #10b981; }
    .badge-danger { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
    .badge-info { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
    .progress-bar { height: 8px; border-radius: 4px; background: #334155; overflow: hidden; }
    .progress-fill { height: 100%; border-radius: 4px;
                     background: linear-gradient(90deg, #10b981, #06b6d4); }
    .footer { text-align: center; color: #475569; font-size: 12px;
              margin-top: 40px; padding-top: 20px; border-top: 1px solid #1e293b; }
  </style>
</head>
<body>
  <div class="container">
    <h1>{{ title }}</h1>
    <p class="subtitle">Workflow Execution Report &middot; Auto-generated</p>

    {% set stats = job_stats.rows if job_stats is defined else rows if rows is defined else [] %}
    {% set failures = recent_failures.rows if recent_failures is defined else [] %}

    {# ── Summary Stats ── #}
    {% if stats|length > 0 %}
    {% set total_jobs = stats|length %}
    {% set total_runs_sum = stats|map(attribute='total_runs')|map('int')|sum %}
    {% set total_success = stats|map(attribute='success_count')|map('int')|sum %}
    {% set success_rate = (total_success / total_runs_sum * 100) if total_runs_sum > 0 else 0 %}
    <div class="stat-grid">
      <div class="stat">
        <div class="stat-value">{{ total_jobs }}</div>
        <div class="stat-label">Total Jobs</div>
      </div>
      <div class="stat">
        <div class="stat-value">{{ total_runs_sum }}</div>
        <div class="stat-label">Total Executions</div>
      </div>
      <div class="stat">
        <div class="stat-value">{{ "%.1f"|format(success_rate) }}%</div>
        <div class="stat-label">Success Rate</div>
        <div class="progress-bar" style="margin-top: 8px;">
          <div class="progress-fill" style="width: {{ success_rate }}%"></div>
        </div>
      </div>
      <div class="stat">
        <div class="stat-value">{{ failures|length }}</div>
        <div class="stat-label">Recent Failures</div>
      </div>
    </div>
    {% endif %}

    {# ── Job Stats Table ── #}
    {% if stats|length > 0 %}
    <div class="card">
      <h2><span class="icon">📊</span> Job Execution Statistics</h2>
      <table>
        <thead>
          <tr>
            <th>Job Name</th>
            <th>Total Runs</th>
            <th>Success</th>
            <th>Failed</th>
            <th>Success Rate</th>
            <th>Avg Duration</th>
          </tr>
        </thead>
        <tbody>
          {% for row in stats %}
          {% set rate = (row.success_count|int / row.total_runs|int * 100) if row.total_runs|int > 0 else 0 %}
          <tr>
            <td><strong>{{ row.job_name }}</strong></td>
            <td>{{ row.total_runs }}</td>
            <td><span class="badge badge-success">{{ row.success_count }}</span></td>
            <td>
              {% if row.fail_count|int > 0 %}
              <span class="badge badge-danger">{{ row.fail_count }}</span>
              {% else %}
              <span class="badge badge-info">0</span>
              {% endif %}
            </td>
            <td>{{ "%.1f"|format(rate) }}%</td>
            <td>{{ row.avg_duration_ms if row.avg_duration_ms else '-' }}ms</td>
          </tr>
          {% endfor %}
        </tbody>
      </table>
    </div>
    {% endif %}

    {# ── Recent Failures ── #}
    {% if failures|length > 0 %}
    <div class="card">
      <h2><span class="icon">🚨</span> Recent Failures</h2>
      <table>
        <thead>
          <tr>
            <th>Job</th>
            <th>Error</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          {% for f in failures %}
          <tr>
            <td><strong>{{ f.job_name }}</strong></td>
            <td style="color: #f87171; max-width: 400px; overflow: hidden; text-overflow: ellipsis;">
              {{ f.error_message[:80] if f.error_message else 'Unknown error' }}
            </td>
            <td style="white-space: nowrap; color: #94a3b8;">{{ f.started_at }}</td>
          </tr>
          {% endfor %}
        </tbody>
      </table>
    </div>
    {% endif %}

    <div class="footer">
      Auto-generated by Job Scheduler Workflow Engine
    </div>
  </div>
</body>
</html>"""

    nodes = [
        node(n1, 250, 50, "시작", "trigger",
             config={"description": "작업 실행 현황 HTML 리포트 생성"}),
        node(n2, 100, 200, "작업별 실행 통계", "sql",
             config={
                 "datasource_id": DS_ID,
                 "query": """SELECT j.name AS job_name,
       COUNT(jr.id)                          AS total_runs,
       COUNT(*) FILTER (WHERE jr.status='success') AS success_count,
       COUNT(*) FILTER (WHERE jr.status='failed')  AS fail_count,
       ROUND(AVG(jr.duration_ms))            AS avg_duration_ms
FROM jobs j LEFT JOIN job_runs jr ON j.id = jr.job_id
GROUP BY j.name ORDER BY total_runs DESC
LIMIT 20""",
             }),
        node(n3, 400, 200, "최근 실패 목록", "sql",
             config={
                 "datasource_id": DS_ID,
                 "query": """SELECT j.name AS job_name, jr.error_message, jr.started_at
FROM job_runs jr JOIN jobs j ON j.id = jr.job_id
WHERE jr.status = 'failed'
ORDER BY jr.started_at DESC LIMIT 10""",
             }),
        node(n4, 250, 400, "데이터 병합", "merge"),
        node(n5, 250, 570, "HTML 리포트 생성", "html",
             config={
                 "title": "작업 실행 현황 리포트",
                 "template": html_template,
             },
             input_mapping={
                 "job_stats": inp(n2, ""),
                 "recent_failures": inp(n3, ""),
             }),
    ]
    edges = [
        edge(n1, n2),
        edge(n1, n3),
        edge(n2, n4),
        edge(n3, n4),
        edge(n4, n5),
    ]

    return {
        "name": "[예시 9] 작업 실행 현황 HTML 리포트",
        "description": "SQL로 작업 실행 통계와 실패 이력을 조회한 후, "
                       "HTML Report 모듈로 시각적 리포트를 생성합니다.\n\n"
                       "1. 작업별 실행 통계 SQL 조회 (병렬)\n"
                       "2. 최근 실패 목록 SQL 조회 (병렬)\n"
                       "3. Merge → HTML 리포트 렌더링\n\n"
                       "✅ 바로 실행 가능 — 결과에서 HTML을 확인할 수 있습니다.",
        "canvas_data": {"nodes": nodes, "edges": edges},
        "status": "active",
        "tags": ["예시", "HTML", "리포트", "SQL", "즉시실행"],
    }


# ── 메인 ───────────────────────────────────────────────────────────────────────

def main():
    db = SessionLocal()
    try:
        _seed(db)
    finally:
        db.close()


def _seed(db):
    print("=" * 60)
    print("워크플로우 예시 시드 v2 — 실제 DB 연결")
    print(f"데이터소스: postgres (localhost:5433/job_scheduler)")
    print("=" * 60)

    # 기존 [예시] 워크플로우 삭제
    old_wfs = db.query(Workflow).filter(Workflow.name.like("[예시%")).all()
    if old_wfs:
        print(f"\n🗑  기존 예시 워크플로우 {len(old_wfs)}개 삭제...")
        for wf in old_wfs:
            print(f"  - {wf.name}")
            db.delete(wf)
        db.flush()

    # 새 워크플로우 생성
    builders = [
        wf1_job_stats,
        wf2_recent_failures,
        wf3_table_size_monitor,
        wf4_etl_pipeline,
        wf5_multi_api_merge,
        wf6_data_quality,
        wf7_workflow_meta,
        wf8_cross_api_sync,
        wf9_html_report,
    ]

    print(f"\n[워크플로우 {len(builders)}개 생성]")
    for builder in builders:
        data = builder()
        wf = Workflow(
            id=mk_id(),
            name=data["name"],
            description=data["description"],
            canvas_data=data["canvas_data"],
            status=data["status"],
            is_active=True,
            schedule_type="manual",
            timeout_seconds=3600,
            max_concurrent=1,
            tags=data["tags"],
        )
        db.add(wf)
        print(f"  ✅ {data['name']}")

    db.commit()

    print(f"\n{'=' * 60}")
    print("✅ 완료! 모든 예시가 바로 실행 가능합니다.")
    print()
    for b in builders:
        data = b()
        print(f"  • {data['name']}")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
