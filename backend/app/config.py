from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    APP_NAME: str = "Job Scheduler"
    DEBUG: bool = True
    VERSION: str = "1.0.0"

    BASE_DIR: Path = Path(__file__).resolve().parent.parent
    DATABASE_URL: str = "postgresql://jongsports@localhost:5433/job_scheduler"
    JOBS_STORAGE_DIR: Path = Path(__file__).resolve().parent.parent / "jobs_storage"

    SECRET_KEY: str = "super-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    DEFAULT_ADMIN_USERNAME: str = "admin"
    DEFAULT_ADMIN_PASSWORD: str = "admin123"
    DEFAULT_ADMIN_EMAIL: str = "admin@jobscheduler.local"

    MAX_CODE_SIZE_BYTES: int = 1_048_576  # 1MB
    DEFAULT_JOB_TIMEOUT: int = 3600  # 1 hour
    MAX_JOB_TIMEOUT: int = 86400  # 24 hours

    # Concurrent Execution
    MAX_CONCURRENT_JOBS: int = 5
    VENV_CACHE_DIR: Path = Path(__file__).resolve().parent.parent / "jobs_venvs"
    VENV_MAX_AGE_DAYS: int = 30
    RETENTION_DAYS: int = 30
    QUEUE_CHECK_INTERVAL: int = 5

    # HTTP / SSL
    HTTP_SSL_VERIFY: bool = False  # Set True in production with proper certs

    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
