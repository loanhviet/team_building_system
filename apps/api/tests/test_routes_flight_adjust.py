"""Manual flight reassignment (BRD §5.5): capacity is re-validated on every
adjust, over-capacity is refused unless the caller explicitly forces it, and
the override is always logged with its reason (audit_service.record_audit)."""

from sqlalchemy import select

from app.core.time import utcnow
from app.models.audit import AuditLog
from app.models.flight import Flight, FlightAssignment
from app.models.organization import Site
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


async def test_adjust_rejects_wrong_site_then_succeeds_with_force(client, world, auth_headers, db_session):
    hcm_site = Site(code="HCM", name="Ho Chi Minh")
    db_session.add(hcm_site)
    await db_session.flush()
    world.employee.site_id = hcm_site.id
    hn_flight = Flight(
        event_id=world.event.id, flight_code="VN003", direction="outbound",
        capacity=5, site_id=world.site.id,
    )
    db_session.add(hn_flight)
    await db_session.commit()

    payload = {
        "employee_ids": [world.employee.id], "flight_id": hn_flight.id, "reason": "test",
    }
    resp = await client.post(
        f"/api/events/{world.event.id}/flight-assignments/adjust",
        headers=auth_headers(world.organizer_user), json=payload,
    )
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "site_mismatch"

    payload = {**payload, "reason": "chuyen theo yeu cau rieng", "force": True}
    resp = await client.post(
        f"/api/events/{world.event.id}/flight-assignments/adjust",
        headers=auth_headers(world.organizer_user), json=payload,
    )
    assert resp.status_code == 200
    assert "site_mismatch_forced" in resp.json()["warnings"]


async def test_unlock_clears_is_locked(client, world, auth_headers, db_session):
    flight = Flight(event_id=world.event.id, flight_code="VN004", direction="outbound", capacity=5)
    db_session.add(flight)
    await db_session.flush()
    assignment = FlightAssignment(
        event_id=world.event.id, flight_id=flight.id, employee_id=world.employee.id,
        direction="outbound", source="manual", is_locked=True,
    )
    db_session.add(assignment)
    await db_session.commit()

    resp = await client.post(
        f"/api/events/{world.event.id}/flight-assignments/unlock",
        headers=auth_headers(world.organizer_user),
        json={"direction": "outbound", "employee_ids": [world.employee.id]},
    )
    assert resp.status_code == 200
    assert resp.json()["unlocked"] == 1

    await db_session.refresh(assignment)
    assert assignment.is_locked is False


async def test_update_flight_rejects_capacity_below_assigned(client, world, auth_headers, db_session):
    flight = Flight(event_id=world.event.id, flight_code="VN005", direction="outbound", capacity=5)
    db_session.add(flight)
    await db_session.flush()
    db_session.add(
        FlightAssignment(
            event_id=world.event.id, flight_id=flight.id, employee_id=world.employee.id,
            direction="outbound", source="auto",
        )
    )
    await db_session.commit()

    resp = await client.patch(
        f"/api/events/{world.event.id}/flights/{flight.id}",
        headers=auth_headers(world.organizer_user), json={"capacity": 0},
    )
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "capacity_below_assigned"


async def test_update_flight_after_publish_emails_passengers(client, world, auth_headers, db_session):
    from app.models.enums import EventStatus

    flight = Flight(event_id=world.event.id, flight_code="VN006", direction="outbound", capacity=5)
    db_session.add(flight)
    await db_session.flush()
    db_session.add(
        FlightAssignment(
            event_id=world.event.id, flight_id=flight.id, employee_id=world.employee.id,
            direction="outbound", source="auto",
        )
    )
    world.event.status = EventStatus.information_published
    await db_session.commit()

    resp = await client.patch(
        f"/api/events/{world.event.id}/flights/{flight.id}",
        headers=auth_headers(world.organizer_user), json={"flight_code": "VN006X"},
    )
    assert resp.status_code == 200
    assert any(job[0] == "send_email" for job in client.fake_queue.jobs)
