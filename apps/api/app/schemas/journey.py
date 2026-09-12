from datetime import datetime

from pydantic import BaseModel


class JourneyFlight(BaseModel):
    direction: str
    flight_code: str
    depart_at: datetime | None
    arrive_at: datetime | None
    origin: str | None
    destination: str | None


class JourneyBus(BaseModel):
    leg_name: str
    bus_code: str
    gather_at: datetime | None
    depart_at: datetime | None
    destination: str | None
    leader_name: str | None
    leader_phone: str | None


class JourneyRoom(BaseModel):
    hotel_name: str
    room_number: str


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
    full_name: str
    team_name: str | None
    is_participating: bool | None
    flights: list[JourneyFlight]
    buses: list[JourneyBus]
    room: JourneyRoom | None
    schedule: list[JourneyScheduleItem]
    announcements: list[JourneyAnnouncement]
