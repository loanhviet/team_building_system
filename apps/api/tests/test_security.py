import jwt
import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


def test_password_hash_roundtrip():
    hashed = hash_password("correct-horse")
    assert hashed != "correct-horse"
    assert verify_password("correct-horse", hashed)
    assert not verify_password("wrong-password", hashed)


def test_access_token_roundtrip():
    token = create_access_token(user_id=42, role="organizer")
    payload = decode_access_token(token)
    assert payload["sub"] == "42"
    assert payload["role"] == "organizer"
    assert payload["type"] == "access"


def test_decode_rejects_tampered_token():
    token = create_access_token(user_id=1, role="employee")
    tampered = token[:-1] + ("a" if token[-1] != "a" else "b")
    with pytest.raises(jwt.InvalidTokenError):
        decode_access_token(tampered)


def test_production_rejects_default_jwt_secret():
    with pytest.raises(ValidationError):
        Settings(app_env="production", app_base_url="https://events.example.com")


def test_production_accepts_https_and_strong_secret():
    settings = Settings(
        app_env="production",
        app_base_url="https://events.example.com",
        jwt_secret="a-strong-production-secret-that-is-over-32-characters",
    )
    assert settings.app_env == "production"
