"""Fernet-based symmetric encryption for sensitive data (e.g. datasource passwords).

The encryption key is derived from the app SECRET_KEY so no additional
configuration is required.
"""
import base64
import hashlib

from cryptography.fernet import Fernet

from app.config import settings


def _get_fernet() -> Fernet:
    """Derive a 32-byte URL-safe base64 key from SECRET_KEY."""
    raw = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    key = base64.urlsafe_b64encode(raw)
    return Fernet(key)


def encrypt_value(plain: str) -> str:
    """Encrypt a plaintext string. Returns a URL-safe base64 token."""
    return _get_fernet().encrypt(plain.encode()).decode()


def decrypt_value(token: str) -> str:
    """Decrypt a token previously encrypted with encrypt_value."""
    return _get_fernet().decrypt(token.encode()).decode()
