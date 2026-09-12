"""Manual flight reassignment (BRD §5.5): capacity is re-validated on every
adjust, over-capacity is refused unless the caller explicitly forces it, and
the override is always logged with its reason (audit_service.record_audit)."""

from sqlalchemy import select

from app.core.time import utcnow
from app.models.audit import AuditLog
from app.models.flight import Flight
from app.models.registration import Registration
from tests.conftest import make_employee


async def _add_second_registration(db_session, world):
    second = await make_employee(db_session, team=world.team, site=world.site, code="NV002")
    db_session.add(
        Registration(
            event_id=world.event.id, employee_id=second.employee.id, status="submitted",
            is_participating=True, shift_id=world.shift.id, agreed_terms_at=utcnow(),
            terms_version="v1", submitted_at=utcnow(),
        )
    )
    return second


async def test_adjust_over_capacity_requires_force_then_succeeds(client, world, auth_headers, db_session):
    second = await _add_second_registration(db_session, world)
    flight = Flight(event_id=world.event.id, flight_code="VN001", direction="outbound", capacity=1)
    db_session.add(flight)
    await db_session.commit()

    payload = {
        "employee_ids": [world.employee.id, second.employee.id],
        "flight_id": flight.id,
        "reason": "gop chuyen",
    }
    resp = await client.post(
        f"/api/events/{world.event.id}/flight-assignments/adjust",
        headers=auth_headers(world.organizer_user), json=payload,
    )
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "over_capacity"

    payload = {**payload, "reason": "ghi de vuot slot de test", "force": True}
    resp = await client.post(
        f"/api/events/{world.event.id}/flight-assignments/adjust",
        headers=auth_headers(world.organizer_user), json=payload,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["moved"] == 2
    assert "over_capacity_forced" in body["warnings"]

    result = await db_session.execute(
        select(AuditLog).where(AuditLog.entity_type == "flight_assignment")
    )
    logs = result.scalars().all()
    assert len(logs) == 2
    assert all(log.reason == "ghi de vuot slot de test" for log in logs)


async def test_adjust_rejects_employee_not_registered_in_event(client, world, auth_headers, db_session):
    flight = Flight(event_id=world.event.id, flight_code="VN002", direction="outbound", capacity=5)
    db_session.add(flight)
    await db_session.commit()

    resp = await client.post(
        f"/api/events/{world.event.id}/flight-assignments/adjust",
        headers=auth_headers(world.organizer_user),
        json={"employee_ids": [999999], "flight_id": flight.id, "reason": "bad id"},
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "invalid_employee_ids"
