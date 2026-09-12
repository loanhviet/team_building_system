"""R5 gap: hotels had no delete for rooms/room-types and no way to unassign
a room — a wrong room assignment couldn't be corrected without raw SQL. These
follow the same soft-delete-with-guard pattern as the Gala table guard
(routers/gala.py's seats_in_use check) so a room/room-type still in use can't
silently vanish while people remain assigned to it."""

from app.models.hotel import Hotel, Room, RoomType


async def _make_hotel_with_room(db_session, event_id: int) -> tuple[Hotel, RoomType, Room]:
    hotel = Hotel(event_id=event_id, name="Khach san A")
    db_session.add(hotel)
    await db_session.flush()
    room_type = RoomType(hotel_id=hotel.id, name="Doi", capacity=2, quantity=10)
    db_session.add(room_type)
    await db_session.flush()
    room = Room(hotel_id=hotel.id, room_type_id=room_type.id, room_number="101", capacity=2)
    db_session.add(room)
    await db_session.flush()
    await db_session.commit()
    return hotel, room_type, room


async def test_delete_room_with_assignment_is_blocked_then_succeeds_after_unassign(
    client, world, auth_headers, db_session
):
    hotel, _room_type, room = await _make_hotel_with_room(db_session, world.event.id)

    resp = await client.post(
        f"/api/events/{world.event.id}/room-assignments/assign",
        headers=auth_headers(world.organizer_user),
        json={"employee_id": world.employee.id, "room_id": room.id},
    )
    assert resp.status_code == 200
    assignment_id = resp.json()["id"]

    resp = await client.delete(
        f"/api/events/{world.event.id}/hotels/{hotel.id}/rooms/{room.id}",
        headers=auth_headers(world.organizer_user),
    )
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "room_in_use"

    resp = await client.delete(
        f"/api/events/{world.event.id}/room-assignments/{assignment_id}",
        headers=auth_headers(world.organizer_user),
    )
    assert resp.status_code == 204

    resp = await client.delete(
        f"/api/events/{world.event.id}/hotels/{hotel.id}/rooms/{room.id}",
        headers=auth_headers(world.organizer_user),
    )
    assert resp.status_code == 204


async def test_delete_room_type_in_use_is_blocked(client, world, auth_headers, db_session):
    hotel, room_type, _room = await _make_hotel_with_room(db_session, world.event.id)

    resp = await client.delete(
        f"/api/events/{world.event.id}/hotels/{hotel.id}/room-types/{room_type.id}",
        headers=auth_headers(world.organizer_user),
    )
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "room_type_in_use"
