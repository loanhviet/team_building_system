"""Which pickup a transport leg is allowed to use.

BRD §4.5 / §7.1: the four legs are independent. A home gathering point
(Hoàn Kiếm) belongs to the city legs only. Airport ↔ hotel legs do not
inherit it.
"""


def is_home_pickup_leg(direction: str | None, flight_timing: str | None) -> bool:
    """Nhà/văn phòng → sân bay, and sân bay → nhà/văn phòng."""
    return (direction == "outbound" and flight_timing == "before_flight") or (
        direction == "inbound" and flight_timing == "after_flight"
    )


def is_destination_leg(direction: str | None, flight_timing: str | None) -> bool:
    """Sân bay → khách sạn, and khách sạn → sân bay."""
    return (direction == "outbound" and flight_timing == "after_flight") or (
        direction == "inbound" and flight_timing == "before_flight"
    )


def pickup_constraint(
    direction: str | None,
    flight_timing: str | None,
    pickup_id: int | None,
    pickup_kind: str | None,
) -> int | None:
    """Pickup id allocation may compare against a bus.

    A workplace point stored on a destination leg is leftover from when every
    leg copied the home pickup. It must not keep the person off the hotel bus.
    """
    if pickup_id is None:
        return None
    if is_home_pickup_leg(direction, flight_timing):
        return pickup_id
    if is_destination_leg(direction, flight_timing):
        return pickup_id if pickup_kind == "venue" else None
    return pickup_id
