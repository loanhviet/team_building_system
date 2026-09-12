from datetime import date, datetime

from pydantic import BaseModel


class JourneyFlight(BaseModel):
    direction: str
    flight_code: str
    airline: str | None = None
    depart_at: datetime | None
    arrive_at: datetime | None
    origin: str | None
    destination: str | None


class JourneyBus(BaseModel):
    leg_name: str
    bus_code: str
    bus_name: str | None = None
    gather_at: datetime | None
    depart_at: datetime | None
    destination: str | None
    pickup_name: str | None = None
    pickup_address: str | None = None
    leader_name: str | None
    leader_phone: str | None
    note: str | None = None


class JourneyRoom(BaseModel):
    hotel_name: str
    hotel_address: str | None = None
    room_number: str
    checkin_date: date | None = None
    checkout_date: date | None = None


class JourneyGalaSeat(BaseModel):
    seat_number: int
    label: str | None = None


class JourneyGalaTable(BaseModel):
    table_code: str
    table_name: str | None = None
    seats: list[JourneyGalaSeat]


class JourneyGala(BaseModel):
    status: str
    name: str
    tables: list[JourneyGalaTable]


class JourneyScheduleItem(BaseModel):
    day_date: str | None
    start_at: datetime | None
    end_at: datetime | None
    title: str
    location: str | None


class JourneyAnnouncement(BaseModel):
    title: str
    body_md: str
    is_pinned: bool
    published_at: datetime | None


class JourneyOut(BaseModel):
    event_id: int
    event_name: str
    event_status: str
    destination: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    full_name: str
    employee_code: str | None = None
    team_name: str | None
    site_name: str | None = None
    phone: str | None = None
    is_participating: bool | None
    flights: list[JourneyFlight]
    buses: list[JourneyBus]
    room: JourneyRoom | None
    gala: JourneyGala | None = None
    schedule: list[JourneyScheduleItem]
    announcements: list[JourneyAnnouncement]
