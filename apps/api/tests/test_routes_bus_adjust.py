"""Manual bus reassignment keeps pickup, timing and capacity constraints hard."""

from app.core.time import utcnow
from app.models.bus import Bus, BusAssignment
from app.models.event import PickupPoint, TransportLeg
from app.models.registration import RegistrationTransportNeed


async def _leg_and_points(db_session, world):
    leg = TransportLeg(
        event_id=world.event.id, code="HN_SB", name="Nhà → Sân bay", direction="outbound",
    )
    point_a = PickupPoint(event_id=world.event.id, site_id=world.site.id, name="Điểm A")
    point_b = PickupPoint(event_id=world.event.id, site_id=world.site.id, name="Điểm B")
    db_session.add_all([leg, point_a, point_b])
    await db_session.flush()
    return leg, point_a, point_b


async def test_adjust_pickup_mismatch_cannot_be_forced(
    client, world, auth_headers, db_session
):
    leg, point_a, point_b = await _leg_and_points(db_session, world)
    db_session.add(
        RegistrationTransportNeed(
            registration_id=world.registration.id, leg_id=leg.id, is_needed=True,
            pickup_point_id=point_a.id,
        )
    )
    bus = Bus(
        event_id=world.event.id, leg_id=leg.id, code="XE01", capacity=5,
        pickup_point_id=point_b.id,
    )
    db_session.add(bus)
    await db_session.commit()

    payload = {"employee_ids": [world.employee.id], "bus_id": bus.id, "reason": "test"}
    resp = await client.post(
        f"/api/events/{world.event.id}/bus-assignments/adjust",
        headers=auth_headers(world.organizer_user), json=payload,
    )
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "bus_incompatible"

    payload = {**payload, "reason": "chuyen theo yeu cau rieng", "force": True}
    resp = await client.post(
        f"/api/events/{world.event.id}/bus-assignments/adjust",
        headers=auth_headers(world.organizer_user), json=payload,
    )
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "bus_incompatible"


async def test_unlock_clears_bus_assignment_lock(client, world, auth_headers, db_session):
    leg = TransportLeg(
        event_id=world.event.id, code="SB_KS", name="Sân bay → Khách sạn", direction="outbound",
    )
    db_session.add(leg)
    await db_session.flush()
    bus = Bus(event_id=world.event.id, leg_id=leg.id, code="XE02", capacity=5)
    db_session.add(bus)
    await db_session.flush()
    assignment = BusAssignment(
        event_id=world.event.id, leg_id=leg.id, bus_id=bus.id, employee_id=world.employee.id,
        source="manual", is_locked=True, assigned_at=utcnow(),
    )
    db_session.add(assignment)
    await db_session.commit()

    resp = await client.post(
        f"/api/events/{world.event.id}/bus-assignments/unlock",
        headers=auth_headers(world.organizer_user),
        json={"leg_id": leg.id, "employee_ids": [world.employee.id]},
    )
    assert resp.status_code == 200
    assert resp.json()["unlocked"] == 1

    await db_session.refresh(assignment)
    assert assignment.is_locked is False


async def test_adjust_rejects_employee_who_did_not_request_leg(
    client, world, auth_headers, db_session
):
    leg, point, _ = await _leg_and_points(db_session, world)
    db_session.add(
        RegistrationTransportNeed(
            registration_id=world.registration.id,
            leg_id=leg.id,
            is_needed=False,
            pickup_point_id=point.id,
        )
    )
    bus = Bus(
        event_id=world.event.id,
        leg_id=leg.id,
        code="XE-NO",
        capacity=5,
        pickup_point_id=point.id,
    )
    db_session.add(bus)
    await db_session.commit()

    resp = await client.post(
        f"/api/events/{world.event.id}/bus-assignments/adjust",
        headers=auth_headers(world.organizer_user),
        json={"employee_ids": [world.employee.id], "bus_id": bus.id, "reason": "test"},
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "invalid_employee_ids"


async def test_bus_preflight_requires_each_needed_employee_flight_data(
    client, world, auth_headers, db_session
):
    leg, point, _ = await _leg_and_points(db_session, world)
    leg.flight_timing = "before_flight"
    db_session.add(
        RegistrationTransportNeed(
            registration_id=world.registration.id,
            leg_id=leg.id,
            is_needed=True,
            pickup_point_id=point.id,
        )
    )
    db_session.add(
        Bus(
            event_id=world.event.id,
            leg_id=leg.id,
            code="XE-TIMING",
            capacity=5,
            pickup_point_id=point.id,
            depart_at=utcnow(),
        )
    )
    await db_session.commit()

    response = await client.get(
        f"/api/events/{world.event.id}/allocations/bus/preflight?leg_id={leg.id}",
        headers=auth_headers(world.organizer_user),
    )
    assert response.status_code == 200
    assert response.json()["ready"] is False
    assert any(
        item["code"] == "flight_allocation_required"
        for item in response.json()["blockers"]
    )
