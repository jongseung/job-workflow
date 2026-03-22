# Concurrent Job Execution & Production-Grade Enhancement Plan

> **Summary**: Job Scheduler를 스크래핑, BigQuery, 외부 API 등 다양한 작업을 안정적으로 동시 실행하는 프로덕션급 시스템으로 확장
>
> **Project**: Job Scheduler
> **Version**: 1.1.0
> **Author**: jongsports
> **Date**: 2026-03-21
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 현재 Job은 단일 프로세스에서 순차 실행되며, 동시성 제어가 없어 같은 Job이 중복 실행되고, 장시간 스크래핑/BigQuery Job이 다른 Job의 실행을 지연시킴. pip 패키지 설치 불가로 requests/beautifulsoup 등 외부 라이브러리 사용 불가 |
| **Solution** | Worker Pool 기반 동시 실행 엔진, Job별 가상환경/패키지 관리, 동시성 제한(Lock), Job 의존성(DAG), 실행 큐 시스템을 도입하여 다수의 이기종 Job이 안전하게 병렬 실행 |
| **Function/UX Effect** | 스크래핑+BigQuery+DB 적재 Job이 동시에 문제없이 실행, 의존 Job 자동 트리거, 실행 상태 실시간 모니터링, 패키지 설치 한 번이면 자동 재사용 |
| **Core Value** | 단일 스케줄러에서 기업급 데이터 파이프라인 오케스트레이터로의 진화 |

---

## 1. Overview

### 1.1 Purpose

다양한 유형의 Job(웹 스크래핑, BigQuery 조회, REST API 호출, DB ETL, 파일 처리 등)이 동시에 안정적으로 실행될 수 있는 프로덕션급 Job Scheduler를 구축한다.

### 1.2 Background

현재 시스템의 제약:
- **동시 실행 제어 없음**: 같은 Job의 cron이 겹치면 중복 실행됨
- **패키지 설치 불가**: subprocess로 실행하지만 venv/pip 관리가 없어 `requests`, `beautifulsoup4`, `google-cloud-bigquery` 등 외부 라이브러리 사용 불가
- **의존성 없음**: Job A의 결과를 Job B가 사용해야 할 때 수동 관리
- **큐 시스템 없음**: 모든 Job이 즉시 실행 시도, 시스템 과부하 가능
- **이력 관리 없음**: 오래된 실행 로그가 무한 축적

### 1.3 Target Job Types

| Job Type | 예시 | 특성 | 필요 패키지 |
|----------|------|------|------------|
| 웹 스크래핑 | 뉴스 수집, 가격 모니터링 | I/O 바운드, 5~30분 | requests, beautifulsoup4, selenium |
| BigQuery | 데이터 조회/집계 | 네트워크 바운드, 1~60분 | google-cloud-bigquery |
| REST API | 외부 서비스 연동 | I/O 바운드, 수초~수분 | requests, httpx |
| DB ETL | 테이블 간 데이터 이동 | CPU+I/O, 수분~1시간 | pandas, sqlalchemy |
| 파일 처리 | CSV/Excel 변환 | CPU 바운드, 수분 | pandas, openpyxl |
| 알림/리포트 | 일일 리포트 생성/발송 | I/O 바운드, 수초 | jinja2, smtplib |

---

## 2. Scope

### 2.1 In Scope

- [ ] **Worker Pool 기반 동시 실행** (configurable max workers)
- [ ] **Job별 패키지 관리** (requirements 필드 + 자동 pip install)
- [ ] **동시성 제한** (Job별 max_concurrent 설정, 중복 실행 방지)
- [ ] **Job 의존성 (DAG)** (depends_on 필드로 선행 Job 완료 후 트리거)
- [ ] **실행 큐 시스템** (priority 기반 대기열, 동시 실행 상한 관리)
- [ ] **실행 이력 보관 정책** (retention days 설정, 자동 정리)
- [ ] **Job 복제** (기존 Job 기반 새 Job 빠른 생성)
- [ ] **일괄 작업** (선택한 Job 일괄 실행/정지/활성화)
- [ ] **Job Import/Export** (JSON 백업/복원)
- [ ] **실행시간 트렌드** (Job별 duration 추이 차트)
- [ ] **프론트엔드 UI** (위 기능들의 설정/모니터링 UI)

### 2.2 Out of Scope

- Docker 기반 격리 실행 (향후 Phase 2)
- 분산 Worker (다중 머신) — 단일 서버 기준
- Kubernetes Job 연동
- GUI 기반 DAG 편집기 (코드/설정으로만)

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| **FR-01** | Worker Pool: `MAX_CONCURRENT_JOBS` 설정으로 동시 실행 Job 수 제한 (기본값: 5) | **High** | Pending |
| **FR-02** | Job별 `max_concurrent: 1` 설정으로 같은 Job 중복 실행 방지 (Lock) | **High** | Pending |
| **FR-03** | Job별 `requirements` 텍스트 필드 (pip format), 실행 전 자동 설치 | **High** | Pending |
| **FR-04** | 공유 venv 캐시: requirements hash 기반 venv 재사용 | **High** | Pending |
| **FR-05** | Job `depends_on` 필드: 선행 Job 완료 시 자동 트리거 | **High** | Pending |
| **FR-06** | 실행 큐: pending 상태 Job을 priority 순으로 처리 | **Medium** | Pending |
| **FR-07** | 이력 보관: `RETENTION_DAYS` 설정, cron으로 오래된 run/log 자동 삭제 | **Medium** | Pending |
| **FR-08** | Job 복제 API: `POST /api/jobs/{id}/clone` | **Medium** | Pending |
| **FR-09** | 일괄 작업 API: `POST /api/jobs/bulk` (run/stop/activate/deactivate) | **Medium** | Pending |
| **FR-10** | Job Import/Export: `GET/POST /api/jobs/export`, `/api/jobs/import` | **Medium** | Pending |
| **FR-11** | 실행시간 트렌드: Job별 최근 N회 duration 데이터 API | **Low** | Pending |
| **FR-12** | 프론트엔드: 패키지 설정, 의존성 설정, 큐 모니터링, 트렌드 차트 UI | **Medium** | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Performance | 동시 5개 Job 실행 시 시스템 응답 < 500ms | API latency 측정 |
| Performance | venv 캐시 히트 시 Job 시작 < 3초 | 첫 로그 출력까지 시간 |
| Reliability | Worker 장애 시 다른 Job에 영향 없음 | 프로세스 격리 검증 |
| Reliability | 서버 재시작 시 running 상태 Job을 failed로 자동 전환 | startup 로직 확인 |
| Storage | 30일 이상 로그 자동 정리 후 DB 사이즈 증가율 < 10MB/월 | DB 사이즈 모니터링 |

---

## 4. Technical Design Overview

### 4.1 Worker Pool Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Scheduler Engine                     │
│              (APScheduler + Custom Queue)              │
│                                                       │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐              │
│  │ Cron    │  │Interval │  │ Manual  │  Triggers     │
│  │ Trigger │  │ Trigger │  │ Trigger │              │
│  └────┬────┘  └────┬────┘  └────┬────┘              │
│       └────────────┼────────────┘                    │
│                    ▼                                  │
│  ┌──────────────────────────────────────┐            │
│  │         Execution Queue              │            │
│  │  (priority-sorted, concurrency-aware)│            │
│  └────────────────┬─────────────────────┘            │
│                   ▼                                  │
│  ┌──────────────────────────────────────┐            │
│  │         Worker Pool                   │            │
│  │  (asyncio.Semaphore, max=5)          │            │
│  │                                       │            │
│  │  ┌────────┐ ┌────────┐ ┌────────┐   │            │
│  │  │Worker 1│ │Worker 2│ │Worker 3│   │            │
│  │  │(venv-A)│ │(venv-B)│ │(venv-A)│   │            │
│  │  └────────┘ └────────┘ └────────┘   │            │
│  └──────────────────────────────────────┘            │
│                                                       │
│  ┌──────────────────────────────────────┐            │
│  │         Lock Manager                  │            │
│  │  (per-job concurrency enforcement)   │            │
│  └──────────────────────────────────────┘            │
└─────────────────────────────────────────────────────┘
```

### 4.2 Package (venv) Management

```
jobs_venvs/
├── _default/                  # 패키지 없는 Job용 (시스템 Python)
├── a1b2c3d4/                  # requirements hash 기반 폴더
│   ├── venv/                  # 실제 가상환경
│   ├── requirements.txt       # 이 venv의 패키지 목록
│   └── created_at             # 생성 시간
└── e5f6g7h8/
    ├── venv/
    ├── requirements.txt
    └── created_at

Flow:
1. Job.requirements → SHA256 hash 계산
2. jobs_venvs/{hash}/ 존재 확인
3. 없으면: python -m venv 생성 → pip install -r
4. 있으면: 즉시 사용 (캐시 히트)
5. venv의 python으로 Job subprocess 실행
```

### 4.3 DAG (의존성) Flow

```
Job A (스크래핑)  ──→  Job B (데이터 정제)  ──→  Job C (DB 적재)
                                              ↗
Job D (BigQuery)  ──→  Job E (집계)  ─────────

1. Job A, D는 독립 실행 (동시 가능)
2. Job B는 A 성공 후 자동 트리거
3. Job E는 D 성공 후 자동 트리거
4. Job C는 B, E 모두 성공 후 자동 트리거
5. 선행 Job 실패 시 후속 Job은 skipped 상태로 기록
```

### 4.4 DB Schema Changes

```sql
-- Job 테이블 신규 컬럼
ALTER TABLE jobs ADD COLUMN requirements TEXT;          -- pip 패키지 (한 줄에 하나)
ALTER TABLE jobs ADD COLUMN max_concurrent INTEGER DEFAULT 1;  -- 동시 실행 제한
ALTER TABLE jobs ADD COLUMN depends_on TEXT;            -- JSON: ["job_id_1", "job_id_2"]

-- 시스템 설정 테이블 (신규)
CREATE TABLE system_config (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- 초기값: MAX_CONCURRENT_JOBS=5, RETENTION_DAYS=30

-- JobRun 신규 컬럼
ALTER TABLE job_runs ADD COLUMN queued_at TIMESTAMP;    -- 큐 진입 시간
ALTER TABLE job_runs ADD COLUMN worker_id VARCHAR(36);  -- 실행 Worker ID
```

### 4.5 Config Changes

```python
# config.py 추가 항목
MAX_CONCURRENT_JOBS: int = 5          # 전체 동시 실행 Job 수
VENV_CACHE_DIR: Path = BASE_DIR / "jobs_venvs"
VENV_MAX_AGE_DAYS: int = 30          # 미사용 venv 자동 삭제
RETENTION_DAYS: int = 30              # 실행 이력 보관 기간
QUEUE_CHECK_INTERVAL: int = 5        # 큐 확인 주기 (초)
```

---

## 5. Implementation Order

### Phase 1: Core Concurrent Execution (FR-01, FR-02, FR-03, FR-04)

**목표**: 다양한 Job이 동시에, 필요한 패키지와 함께 실행

| Step | 작업 | 파일 | 예상 |
|------|------|------|------|
| 1-1 | `config.py`에 설정 추가 | `config.py` | 10분 |
| 1-2 | Worker Pool (Semaphore) 구현 | `services/worker_pool.py` (신규) | 30분 |
| 1-3 | Job Lock Manager 구현 | `services/worker_pool.py` | 20분 |
| 1-4 | venv Manager 구현 | `services/venv_manager.py` (신규) | 40분 |
| 1-5 | execution_service에 Worker Pool + venv 통합 | `services/execution_service.py` | 30분 |
| 1-6 | Job 모델/스키마에 `requirements`, `max_concurrent` 추가 | `models/job.py`, `schemas/job.py` | 15분 |
| 1-7 | DB 마이그레이션 | `database.py` | 10분 |
| 1-8 | 프론트엔드: Job 생성/수정에 requirements 입력 UI | `JobCreatePage.tsx`, `JobEditPage.tsx` | 30분 |
| 1-9 | 대시보드: 동시 실행 현황 표시 | `DashboardPage.tsx` | 20분 |

### Phase 2: DAG & Queue (FR-05, FR-06)

**목표**: Job 간 의존성과 우선순위 기반 실행 큐

| Step | 작업 | 파일 | 예상 |
|------|------|------|------|
| 2-1 | Job 모델에 `depends_on` 추가 | `models/job.py`, `schemas/job.py` | 15분 |
| 2-2 | DAG 유효성 검증 (순환 참조 방지) | `services/dag_service.py` (신규) | 30분 |
| 2-3 | 의존성 트리거 로직 (Job 완료 시 후속 Job 확인) | `services/execution_service.py` | 30분 |
| 2-4 | 실행 큐 서비스 (priority + FIFO) | `services/queue_service.py` (신규) | 30분 |
| 2-5 | scheduler engine에 큐 통합 | `scheduler/engine.py` | 20분 |
| 2-6 | 프론트엔드: 의존성 설정 UI + 큐 모니터링 | `JobCreatePage.tsx`, 신규 컴포넌트 | 40분 |

### Phase 3: Operations & Monitoring (FR-07 ~ FR-12)

**목표**: 운영 편의 기능

| Step | 작업 | 파일 | 예상 |
|------|------|------|------|
| 3-1 | 이력 보관 정책 (자동 정리 cron) | `services/maintenance_service.py` (신규) | 20분 |
| 3-2 | Job 복제 API | `routers/jobs.py`, `services/job_service.py` | 15분 |
| 3-3 | 일괄 작업 API | `routers/jobs.py`, `services/job_service.py` | 20분 |
| 3-4 | Import/Export API | `routers/jobs.py`, `services/job_service.py` | 25분 |
| 3-5 | 실행시간 트렌드 API | `routers/runs.py` | 15분 |
| 3-6 | 프론트엔드: 트렌드 차트, 일괄 작업 UI, Import/Export UI | 여러 컴포넌트 | 60분 |
| 3-7 | 서버 재시작 시 orphaned run 처리 | `main.py` startup 로직 | 15분 |

---

## 6. Success Criteria

### 6.1 Definition of Done

- [ ] 5개 Job이 동시에 실행되며 서로 간섭 없음
- [ ] `requests`, `beautifulsoup4` 등 pip 패키지 사용하는 Job이 정상 실행
- [ ] 같은 Job의 cron이 겹쳐도 `max_concurrent=1` 설정 시 중복 실행 안됨
- [ ] Job A → Job B 의존성 설정 시 A 성공 후 B 자동 실행
- [ ] 30일 이상 된 실행 이력이 자동 정리됨
- [ ] TypeScript 타입 에러 0개, 빌드 성공

### 6.2 Quality Criteria

- [ ] 동시 5개 Job 실행 중 API 응답 < 500ms
- [ ] venv 캐시 히트 시 Job 시작 < 3초
- [ ] 순환 의존성 설정 시 명확한 에러 메시지 반환
- [ ] 프론트엔드 빌드 성공 + 모든 페이지 정상 렌더링

---

## 7. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| venv 디스크 공간 폭발 | High | Medium | hash 기반 중복 방지 + 미사용 venv 자동 삭제 (30일) |
| pip install 타임아웃 | Medium | Medium | 설치 타임아웃 300초 + 캐시 재사용으로 최소화 |
| DAG 순환 참조 | High | Low | 저장 시 DFS 기반 순환 탐지 → 거부 |
| Worker 누수 (좀비 프로세스) | High | Low | Semaphore + finally 블록으로 항상 해제, startup 시 orphan 정리 |
| SQLite Lock 경합 (동시 쓰기) | Medium | Medium | WAL 모드 이미 적용 + busy_timeout=5000ms |
| BigQuery Job이 Semaphore 슬롯 독점 | Medium | Medium | Job별 timeout 엄격 적용 + 긴 Job 전용 슬롯 고려 |

---

## 8. Architecture Considerations

### 8.1 Project Level

| Level | Characteristics | Selected |
|-------|-----------------|:--------:|
| **Starter** | Simple structure | |
| **Dynamic** | Feature-based modules, BaaS | |
| **Enterprise** | Strict layer separation, DI, microservices | **X** |

### 8.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| Worker Pool | Thread Pool / asyncio.Semaphore / Celery | **asyncio.Semaphore** | 이미 asyncio 기반, 외부 의존성 없음 |
| venv 관리 | Docker / venv per job / shared venv cache | **Shared venv cache** | 디스크 효율 + 빠른 시작, Docker 없이도 격리 |
| 실행 큐 | Redis Queue / DB Queue / In-memory | **DB Queue** (job_runs.status='queued') | 영속성, 서버 재시작 안전, 추가 인프라 불필요 |
| DAG 저장 | 별도 테이블 / JSON 필드 | **JSON 필드** (depends_on) | 단순, Job 모델에 통합, 소규모에 충분 |
| Lock | Redis Lock / DB Lock / In-memory Lock | **In-memory dict** (asyncio.Lock per job_id) | 단일 서버, 빠름, 서버 재시작 시 자연 해제 |

### 8.3 File Structure (신규/수정)

```
backend/app/
├── config.py                          # (수정) 동시성/venv/보관 설정 추가
├── database.py                        # (수정) 마이그레이션 추가
├── models/
│   └── job.py                         # (수정) requirements, max_concurrent, depends_on
├── schemas/
│   └── job.py                         # (수정) 신규 필드 스키마
├── services/
│   ├── execution_service.py           # (수정) Worker Pool + venv 통합
│   ├── worker_pool.py                 # (신규) Semaphore + Lock Manager
│   ├── venv_manager.py                # (신규) venv 생성/캐시/정리
│   ├── dag_service.py                 # (신규) 의존성 검증 + 후속 Job 트리거
│   ├── queue_service.py               # (신규) Priority Queue 관리
│   └── maintenance_service.py         # (신규) 이력 정리, venv 정리
├── routers/
│   └── jobs.py                        # (수정) clone, bulk, import/export 엔드포인트
└── scheduler/
    └── engine.py                      # (수정) 큐 통합, 유지보수 cron 등록

frontend/src/
├── features/jobs/
│   ├── JobCreatePage.tsx              # (수정) requirements, depends_on, max_concurrent UI
│   ├── JobEditPage.tsx                # (수정) 동일
│   ├── JobDetailPage.tsx              # (수정) 의존성 시각화, 실행 트렌드 차트
│   └── JobListPage.tsx                # (수정) 일괄 작업 UI, Import/Export 버튼
├── features/dashboard/
│   └── DashboardPage.tsx              # (수정) Worker Pool 현황, 큐 상태
└── types/
    └── api.ts                         # (수정) 신규 필드 타입
```

---

## 9. Next Steps

1. [ ] Design 문서 작성 (`concurrent-execution.design.md`)
2. [ ] Phase 1 구현 시작 (Worker Pool + venv + 동시성 제어)
3. [ ] Phase 2 구현 (DAG + Queue)
4. [ ] Phase 3 구현 (Operations + Monitoring)
5. [ ] 통합 테스트 (스크래핑 + BigQuery 시뮬레이션 + DB 적재 동시 실행)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-21 | Initial draft | jongsports |
