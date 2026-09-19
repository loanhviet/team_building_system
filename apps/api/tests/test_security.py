import jwt
import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.core.errors import AppError
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from app.services.auth_rate_limit import check_login_rate
from tests.conftest import FakeQueue


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


async def test_login_limit_is_scoped_to_client_and_identity():
    redis = FakeQueue()
    for _ in range(10):
        await check_login_rate(redis, "USER@EXAMPLE.COM", "192.0.2.1")
    with pytest.raises(AppError) as exc:
        await check_login_rate(redis, "user@example.com", "192.0.2.1")
    assert exc.value.code == "login_rate_limited"
    await check_login_rate(redis, "user@example.com", "192.0.2.2")


async def test_event_name_cannot_be_only_whitespace(client, world, auth_headers):
    headers = auth_headers(world.organizer_user)
    created = await client.post(
        "/api/events", headers=headers, json={"code": "NEW", "name": "   "},
    )
    assert created.status_code == 422
    edited = await client.patch(
        f"/api/events/{world.event.id}", headers=headers, json={"name": "   "},
    )
    assert edited.status_code == 422


async def test_custom_validator_error_returns_422_not_500(client, world, auth_headers):
    """A schema-level `model_validator` raising ValueError must come back as the
    app's normal 422 error body. Pydantic v2 stores the live exception in
    ctx["error"], which used to make the JSON response itself blow up."""
    res = await client.put(
        f"/api/events/{world.event.id}/gala/config",
        headers=auth_headers(world.organizer_user),
        json={"name": "Gala Dinner", "seat_quota_rule": "fixed"},
    )
    assert res.status_code == 422
    body = res.json()
    assert body["error"]["code"] == "validation_error"
    assert "Hạn mức cố định" in str(body["error"]["details"])


async def test_huge_entity_ids_are_rejected_before_database_binding(client, world, auth_headers):
    huge = "99999999999999999999"
    for path in [
        f"/api/events/{huge}",
        f"/api/jobs/{huge}",
        f"/api/employees?team_id={huge}",
        f"/api/journey/me?event_id={huge}&employee_id=1",
    ]:
        response = await client.get(path, headers=auth_headers(world.organizer_user))
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "validation_error"


async def test_event_settings_reject_non_finite_weights(client, world, auth_headers):
    response = await client.put(
        f"/api/events/{world.event.id}/settings",
        headers=auth_headers(world.organizer_user),
        content='{"flight_allocation_weights":{"same_shift":NaN}}',
    )
    assert response.status_code == 422
