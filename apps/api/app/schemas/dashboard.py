from pydantic import BaseModel


class ShiftCount(BaseModel):
    shift_name: str
    count: int


class LegTransportCount(BaseModel):
    leg_name: str
    count: int


class FlightSlotStatus(BaseModel):
    flight_code: str
    direction: str
    capacity: int
    assigned: int


class BusLegStatus(BaseModel):
    leg_name: str
    needed: int
    assigned: int


class DashboardOut(BaseModel):
    total_employees: int
    registered_count: int
    not_registered_count: int
    participating_count: int
    not_participating_count: int
    by_shift: list[ShiftCount]
    transport_need_by_leg: list[LegTransportCount]
    flight_slots: list[FlightSlotStatus]
    flights_flagged_count: int
    rooms_assigned: int
    rooms_total_capacity: int
    buses_by_leg: list[BusLegStatus]
    buses_flagged_count: int
    buses_without_leader_count: int
