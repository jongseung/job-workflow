import sys

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from app.config import settings

_is_win = sys.platform == "win32"

engine = create_engine(
    settings.DATABASE_URL,
    pool_size=5 if _is_win else 10,
    max_overflow=10 if _is_win else 20,
    pool_pre_ping=True,
    pool_recycle=1800,  # Recycle stale connections every 30 min
    echo=settings.DEBUG,
)


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)
