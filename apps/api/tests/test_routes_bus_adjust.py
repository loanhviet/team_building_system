"""Manual bus reassignment (BRD §7.4/§7.5, mirrors flight adjust): a bus that
doesn't match the CBNV's registered pickup point is refused unless the caller
explicitly forces it, and `unlock` reverses a manual pin so a later auto-run
can reconsider the person."""

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


async def test_adjust_rejects_pickup_mismatch_then_succeeds_with_force(
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
    assert resp.status_code == 200
    assert "bus_incompatible_forced" in resp.json()["warnings"]


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
