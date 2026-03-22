import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.auth import LoginRequest, TokenResponse, RefreshRequest
from app.schemas.user import UserResponse
from app.services.auth_service import authenticate_user, create_tokens, refresh_access_token
from app.services.audit_service import log_audit
from app.core.dependencies import get_current_user
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])


def _safe_audit(db: Session, *args, **kwargs):
    """Log audit trail without blocking the request on DB lock errors."""
    try:
        log_audit(db, *args, **kwargs)
    except Exception as e:
        logger.warning(f"Audit log failed (non-fatal): {e}")
        db.rollback()


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, request: Request, db: Session = Depends(get_db)):
    user = authenticate_user(db, data.username, data.password)
    if not user:
        _safe_audit(db, "login_failed", "auth", details={"username": data.username},
                    ip_address=request.client.host if request.client else None)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )
    _safe_audit(db, "login", "auth", user_id=user.id,
                details={"username": user.username},
                ip_address=request.client.host if request.client else None)
    return create_tokens(user)


@router.post("/refresh", response_model=TokenResponse)
def refresh(data: RefreshRequest, db: Session = Depends(get_db)):
    tokens = refresh_access_token(db, data.refresh_token)
    if not tokens:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )
    return tokens


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user
