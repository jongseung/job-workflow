# Job Scheduler

Python 스크립트 작업과 워크플로우를 스케줄링하고 실행하는 웹 기반 관리 플랫폼.

## 기술 스택

| 영역 | 기술 |
|------|------|
| Backend | FastAPI, SQLAlchemy, APScheduler, Python 3.12+ |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, React Flow |
| Database | PostgreSQL (개발/운영), SQLite (Docker 기본값) |
| 인프라 | Docker Compose, Nginx |

## 주요 기능

- **작업 관리**: Python 스크립트 등록, cron/interval/manual 스케줄링
- **워크플로우 엔진**: React Flow 기반 DAG 편집기, 노드 간 데이터 매핑, 실시간 실행 로그
- **실행 관리**: 동시 실행 제어, 의존성(DAG) 기반 실행, 가상환경 자동 관리
- **로그/모니터링**: 실행 이력 조회, 워크플로우별 필터링, 자동 로그 정리 (3일 보관)
- **사용자 관리**: JWT 인증, 역할 기반 접근제어, 생성자/수정자 추적
- **데이터소스**: PostgreSQL, MySQL, MSSQL 외부 연결 관리
- **알림**: 웹훅 기반 실행 결과 알림

---

## 1. 로컬 개발 환경 셋업

### 사전 요구사항

- Python 3.12+
- Node.js 20+
- PostgreSQL 14+

---

### 1-1. PostgreSQL 준비

<details>
<summary><b>macOS</b></summary>

```bash
# Homebrew로 설치
brew install postgresql@16
brew services start postgresql@16

# DB 생성
createdb -p 5432 job_scheduler
```
</details>

<details>
<summary><b>Windows</b></summary>

1. [PostgreSQL 공식 사이트](https://www.postgresql.org/download/windows/)에서 인스톨러 다운로드 후 설치
2. 설치 중 비밀번호 설정 (예: `postgres`) — 이후 `.env`에 사용
3. 설치 완료 후 **pgAdmin** 또는 **SQL Shell (psql)** 실행:

```sql
-- psql 접속 후
CREATE DATABASE job_scheduler;
```

또는 **명령 프롬프트**(PostgreSQL bin 폴더가 PATH에 추가된 경우):

```cmd
psql -U postgres -c "CREATE DATABASE job_scheduler;"
```
</details>

<details>
<summary><b>Linux (Ubuntu/Debian)</b></summary>

```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql

# postgres 사용자로 DB 생성
sudo -u postgres createdb job_scheduler
# 비밀번호 설정
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';"
```
</details>

---

### 1-2. Backend 설정

<details>
<summary><b>macOS / Linux</b></summary>

```bash
cd backend

# 가상환경 생성 및 패키지 설치
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 환경변수 설정 (.env 파일 생성)
cat > .env << 'EOF'
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/job_scheduler
SECRET_KEY=your-secret-key-change-this
DEBUG=true
DEFAULT_ADMIN_USERNAME=admin
DEFAULT_ADMIN_PASSWORD=admin123
DEFAULT_ADMIN_EMAIL=admin@jobscheduler.local
CORS_ORIGINS=["http://localhost:5173"]
EOF

# 서버 실행 (DB 테이블 자동 생성됨)
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
</details>

<details>
<summary><b>Windows (PowerShell)</b></summary>

```powershell
cd backend

# 가상환경 생성 및 패키지 설치
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt

# 환경변수 설정 (.env 파일 생성)
@"
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/job_scheduler
SECRET_KEY=your-secret-key-change-this
DEBUG=true
DEFAULT_ADMIN_USERNAME=admin
DEFAULT_ADMIN_PASSWORD=admin123
DEFAULT_ADMIN_EMAIL=admin@jobscheduler.local
CORS_ORIGINS=["http://localhost:5173"]
"@ | Out-File -Encoding utf8 .env

# 서버 실행 (DB 테이블 자동 생성됨)
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

> **Windows 참고사항**:
> - PowerShell 실행 정책 오류 시: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` 실행
> - `psycopg2-binary` 설치 실패 시: [Visual C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) 설치 필요
> - `pymssql` 설치 실패 시 무시 가능 (MSSQL 데이터소스 미사용 시)
</details>

> 서버 첫 실행 시 `init_db()`가 호출되어 모든 테이블이 자동 생성되고, 기본 admin 계정이 만들어집니다.

---

### 1-3. Frontend 설정

```bash
cd frontend

npm install
npm run dev   # http://localhost:5173
```

> Windows에서도 동일합니다. PowerShell 또는 명령 프롬프트에서 실행하세요.

---

### 1-4. 접속

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API 문서: http://localhost:8000/docs
- 기본 계정: `admin` / `admin123`

---

## 2. Docker Compose (프로덕션/원클릭 배포)

별도 DB 설치 없이 SQLite를 사용하는 올인원 배포입니다.

```bash
# 빌드 및 실행
docker compose up -d --build

# 상태 확인
docker compose ps

# 로그 확인
docker compose logs -f backend
```

- 접속: http://localhost (프론트엔드 + API 프록시)
- 기본 계정: `admin` / `admin123`

### 환경변수 커스터마이징

`docker-compose.yml`의 `environment` 섹션을 수정하거나 `.env` 파일을 사용하세요:

```yaml
environment:
  - SECRET_KEY=your-production-secret-key
  - DATABASE_URL=postgresql://user:pass@db-host:5432/job_scheduler
  - CORS_ORIGINS=["https://your-domain.com"]
```

### PostgreSQL과 함께 Docker Compose 사용

`docker-compose.yml`을 아래처럼 확장할 수 있습니다:

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: job_scheduler
      POSTGRES_USER: scheduler
      POSTGRES_PASSWORD: changeme
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  backend:
    build: ./backend
    ports:
      - "8000:8000"
    volumes:
      - ./backend/jobs_storage:/app/jobs_storage
    environment:
      - DATABASE_URL=postgresql://scheduler:changeme@db:5432/job_scheduler
      - SECRET_KEY=change-this-in-production
      - CORS_ORIGINS=["http://localhost","http://localhost:80"]
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

  frontend:
    build: ./frontend
    ports:
      - "80:80"
    depends_on:
      backend:
        condition: service_healthy
    restart: unless-stopped

volumes:
  pgdata:
```

---

## 3. 데이터베이스 상세

### 자동 초기화

서버 시작 시 `init_db()`가 자동으로 실행되어 아래 작업을 수행합니다:

1. 모든 테이블 생성 (`CREATE TABLE IF NOT EXISTS`)
2. 기본 admin 계정 생성 (없는 경우)
3. 고아 실행(orphaned runs) 복구 — 서버 재시작 시 `running` 상태인 작업을 `failed`로 변경

**별도의 마이그레이션 도구(Alembic 등)는 사용하지 않습니다.** SQLAlchemy의 `create_all()`로 스키마를 관리합니다.

### 테이블 구조

| 테이블 | 설명 |
|--------|------|
| `users` | 사용자 계정 (username, email, role, password hash) |
| `jobs` | 작업 정의 (스크립트, 스케줄, 태그, 데이터소스 연결) |
| `job_runs` | 작업 실행 이력 (상태, 시작/종료 시간, 에러) |
| `job_logs` | 실행 중 stdout/stderr 로그 라인 |
| `workflows` | 워크플로우 정의 (노드, 엣지, 캔버스 데이터) |
| `workflow_runs` | 워크플로우 실행 이력 |
| `workflow_node_runs` | 워크플로우 내 개별 노드 실행 이력 |
| `datasources` | 외부 DB 연결 정보 (PostgreSQL, MySQL, MSSQL) |
| `audit_logs` | 감사 로그 (사용자 활동 추적) |

### 수동 DB 리셋

```bash
# PostgreSQL
psql -c "DROP DATABASE job_scheduler;"
psql -c "CREATE DATABASE job_scheduler;"
# 서버 재시작하면 자동으로 테이블 재생성
```

### 자동 로그 정리

매일 03:00에 스케줄러가 3일 이상 된 완료/실패 실행 기록과 로그를 자동 삭제합니다. 보관 기간은 `backend/app/services/maintenance_service.py`의 `LOG_RETENTION_DAYS`에서 변경할 수 있습니다.

---

## 4. 환경변수 레퍼런스

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `DATABASE_URL` | `postgresql://...localhost:5433/job_scheduler` | DB 연결 문자열 |
| `SECRET_KEY` | `super-secret-key-change-in-production` | JWT 서명 키 |
| `DEBUG` | `true` | 디버그 모드 (SQL 쿼리 로깅) |
| `DEFAULT_ADMIN_USERNAME` | `admin` | 초기 관리자 ID |
| `DEFAULT_ADMIN_PASSWORD` | `admin123` | 초기 관리자 비밀번호 |
| `DEFAULT_ADMIN_EMAIL` | `admin@jobscheduler.local` | 초기 관리자 이메일 |
| `MAX_CONCURRENT_JOBS` | `5` | 동시 실행 가능 작업 수 |
| `CORS_ORIGINS` | `["http://localhost:5173"]` | 허용 CORS 오리진 |
| `RETENTION_DAYS` | `30` | 실행 이력 보관 일수 |
| `QUEUE_CHECK_INTERVAL` | `5` | 큐 폴링 간격 (초) |

---

## 5. Makefile 명령어

```bash
make install           # 백엔드 + 프론트엔드 의존성 설치
make dev-backend       # 백엔드 개발 서버 실행
make dev-frontend      # 프론트엔드 개발 서버 실행
make build-frontend    # 프론트엔드 프로덕션 빌드
make test              # 백엔드 테스트 실행
make lint              # TypeScript 타입 체크
make docker-build      # Docker 이미지 빌드
make docker-up         # Docker Compose 실행
make docker-down       # Docker Compose 중지
make clean             # 빌드 캐시 정리
```

---

## 6. 프로젝트 구조

```
job-scheduler/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI 앱 + 라이프사이클
│   │   ├── config.py            # 환경 설정 (pydantic-settings)
│   │   ├── database.py          # SQLAlchemy 엔진/세션
│   │   ├── models/              # ORM 모델 (Job, Workflow, User, ...)
│   │   ├── schemas/             # Pydantic 스키마
│   │   ├── routers/             # API 엔드포인트
│   │   ├── services/            # 비즈니스 로직
│   │   ├── scheduler/           # APScheduler 엔진
│   │   └── modules/             # 워크플로우 실행 모듈
│   ├── jobs_storage/            # 업로드된 스크립트 저장소
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── api/                 # API 클라이언트
│   │   ├── features/            # 페이지별 컴포넌트
│   │   ├── components/          # 공통 UI 컴포넌트
│   │   ├── stores/              # Zustand 상태관리
│   │   └── types/               # TypeScript 타입
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
├── Makefile
└── README.md
```
