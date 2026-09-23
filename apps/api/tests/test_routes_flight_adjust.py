"""Manual flight reassignment keeps physical constraints hard and auditable."""

from sqlalchemy import select

from app.core.time import utcnow
from app.models.audit import AuditLog
from app.models.enums import EventStatus
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


async def test_adjust_over_capacity_cannot_be_forced(client, world, auth_headers, db_session):
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
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "over_capacity"

    result = await db_session.execute(
        select(AuditLog).where(AuditLog.entity_type == "flight_assignment")
    )
    logs = result.scalars().all()
    assert len(logs) == 0


async def test_allocation_uses_event_settings_when_preset_is_omitted(
    client, world, auth_headers, db_session
):
    world.event.status = EventStatus.registration_closed
    db_session.add(
        Flight(event_id=world.event.id, flight_code="VN-SET", direction="outbound", capacity=5)
    )
    await db_session.commit()

    response = await client.post(
        f"/api/events/{world.event.id}/allocations/flight",
        headers=auth_headers(world.organizer_user),
        json={"direction": "outbound"},
    )
    assert response.status_code == 202
    name, args, _kwargs = client.fake_queue.jobs[-1]  # type: ignore[attr-defined]
    assert name == "run_flight_allocation_task"
    assert args[-1] is None


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


async def test_adjust_rejects_non_participant(client, world, auth_headers, db_session):
    world.registration.is_participating = False
    flight = Flight(
        event_id=world.event.id, flight_code="VN-NO", direction="outbound", capacity=5
    )
    db_session.add(flight)
    await db_session.commit()

    resp = await client.post(
        f"/api/events/{world.event.id}/flight-assignments/adjust",
        headers=auth_headers(world.organizer_user),
        json={"employee_ids": [world.employee.id], "flight_id": flight.id, "reason": "test"},
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "invalid_employee_ids"


async def test_shift_mismatch_requires_ack_and_stays_flagged(
    client, world, auth_headers, db_session
):
    from app.models.event import Shift

    other_shift = Shift(event_id=world.event.id, code="C2", name="Ca 2", sort_order=2)
    db_session.add(other_shift)
    await db_session.flush()
    flight = Flight(
        event_id=world.event.id,
        flight_code="VN-C2",
        direction="outbound",
        shift_id=other_shift.id,
        site_id=world.site.id,
        capacity=5,
    )
    db_session.add(flight)
    await db_session.commit()
    payload = {
        "employee_ids": [world.employee.id],
        "flight_id": flight.id,
        "reason": "Điều chỉnh theo yêu cầu",
    }

    resp = await client.post(
        f"/api/events/{world.event.id}/flight-assignments/adjust",
        headers=auth_headers(world.organizer_user),
        json=payload,
    )
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "soft_warning_required"

    resp = await client.post(
        f"/api/events/{world.event.id}/flight-assignments/adjust",
        headers=auth_headers(world.organizer_user),
        json={**payload, "accept_soft_warnings": True},
    )
    assert resp.status_code == 200
    assignment = (
        await db_session.execute(
            select(FlightAssignment).where(
                FlightAssignment.employee_id == world.employee.id
            )
        )
    ).scalar_one()
    assert assignment.is_flagged is True
    assert assignment.flag_reason == "shift_mismatch"


async def test_flight_preflight_reports_missing_resources(client, world, auth_headers):
    resp = await client.get(
        f"/api/events/{world.event.id}/allocations/flight/preflight?direction=outbound",
        headers=auth_headers(world.organizer_user),
    )
    assert resp.status_code == 200
    assert resp.json()["ready"] is False
    assert any(item["code"] == "no_flights" for item in resp.json()["blockers"])


async def test_adjust_wrong_site_cannot_be_forced(client, world, auth_headers, db_session):
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
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "site_mismatch"


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
    assert resp.status_code == 422


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


async def test_update_flight_time_notifies_registered_shift_before_allocation(
    client, world, auth_headers, db_session
):
    """A Ca 1/2 participant needs a timing update even before BTC allocates seats."""
    from app.models.notification import EmailOutbox

    flight = Flight(
        event_id=world.event.id,
        flight_code="VN-CA1",
        direction="outbound",
        shift_id=world.shift.id,
        depart_at=utcnow().replace(hour=7, minute=0, second=0, microsecond=0),
        capacity=5,
    )
    db_session.add(flight)
    await db_session.commit()

    response = await client.patch(
        f"/api/events/{world.event.id}/flights/{flight.id}",
        headers=auth_headers(world.organizer_user),
        json={"depart_at": utcnow().replace(hour=8, minute=0, second=0, microsecond=0).isoformat()},
    )

    assert response.status_code == 200
    assert any(job[0] == "send_email" for job in client.fake_queue.jobs)
    result = await db_session.execute(
        select(EmailOutbox).where(EmailOutbox.template_code == "flight_changed")
    )
    outbox = result.scalar_one()
    assert outbox.to_email == world.employee.email
    assert "VN-CA1" in outbox.payload_json["change_summary"]
    assert "giờ đi" in outbox.payload_json["change_summary"]


async def test_reimporting_a_flight_time_emails_the_registered_shift(
    client, world, auth_headers, db_session
):
    from datetime import datetime
    from io import BytesIO

    from openpyxl import Workbook

    from app.models.notification import EmailOutbox

    flight = Flight(
        event_id=world.event.id,
        flight_code="VN-CA1",
        direction="outbound",
        shift_id=world.shift.id,
        depart_at=datetime(2026, 12, 20, 7, 0),
        arrive_at=datetime(2026, 12, 20, 8, 20),
        capacity=5,
    )
    db_session.add(flight)
    await db_session.commit()

    book = Workbook()
    sheet = book.active
    sheet.append(["flight_code", "direction", "capacity", "depart_at", "arrive_at"])
    sheet.append(["VN-CA1", "outbound", 5, datetime(2026, 12, 20, 9, 0), datetime(2026, 12, 20, 10, 20)])
    payload = BytesIO()
    book.save(payload)

    response = await client.post(
        f"/api/events/{world.event.id}/flights/import",
        headers=auth_headers(world.organizer_user),
        files={"file": ("flights.xlsx", payload.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )

    assert response.status_code == 200
    assert response.json()["ok_rows"] == 1
    result = await db_session.execute(
        select(EmailOutbox).where(EmailOutbox.template_code == "flight_changed")
    )
    outbox = result.scalar_one()
    assert outbox.to_email == world.employee.email
    assert "09:00" in outbox.payload_json["change_summary"]
