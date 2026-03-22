from sqlalchemy.orm import Session

from app.models.user import User
from app.core.security import verify_password, get_password_hash, create_access_token, create_refresh_token, decode_token
from app.schemas.auth import TokenResponse


def authenticate_user(db: Session, username: str, password: str) -> User | None:
    user = db.query(User).filter(User.username == username).first()
    if not user or not verify_password(password, user.hashed_password):
        return None
    if not user.is_active:
        return None
    return user


def create_tokens(user: User) -> TokenResponse:
    token_data = {"sub": user.id, "username": user.username, "role": user.role}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


def refresh_access_token(db: Session, refresh_token_str: str) -> TokenResponse | None:
    payload = decode_token(refresh_token_str)
    if payload is None or payload.get("type") != "refresh":
        return None
    user_id = payload.get("sub")
    user = db.query(User).filter(User.id == user_id).first()
    if user is None or not user.is_active:
        return None
    return create_tokens(user)


def create_default_admin(db: Session, username: str, password: str, email: str) -> User | None:
    existing = db.query(User).filter(User.username == username).first()
    if existing:
        return existing
    admin = User(
        username=username,
        email=email,
        hashed_password=get_password_hash(password),
        role="admin",
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return admin
