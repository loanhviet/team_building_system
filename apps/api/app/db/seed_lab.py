"""TBLAB — a deliberately tiny, fully hand-traceable event for learning/debugging.

Why a second seed instead of reusing `seed.py`: TB2026 has 120 employees and 97
participants. You cannot verify an allocator's decision against that by hand, so
when a run looks wrong you have no way to tell whether the algorithm misbehaved
or your mental model did. TBLAB has **16 participants** picked so that every
branch of every allocation algorithm fires exactly once, and the whole outcome
fits in one table you can check on paper.

Nothing is random and nothing is pre-allocated: flights/buses start empty on
purpose so you run them yourself and compare against docs/LAB-EVENT.md.

    docker compose exec api python -m app.db.seed_lab
    docker compose exec api python -m app.db.seed_lab --reset   # rebuild it

Login: any LAB code as both email and password, e.g. lab001@teambuilding.vn /
LAB001 (LAB001/005/008/010 are team_leader, so they can pick Gala seats).
"""

import argparse
import asyncio
from datetime import date, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.core.time import utcnow
from app.db.session import AsyncSessionLocal
from app.models.audit import AuditLog
from app.models.auth import RefreshToken, User
from app.models.bus import Bus, BusAssignment
from app.models.enums import EventStatus, UserRole
from app.models.event import Event, EventSetting, PickupPoint, Shift, TransportLeg
from app.models.flight import Flight, FlightAssignment
from app.models.gala import GalaConfig, GalaSeat, GalaTable, GalaTurn
from app.models.hotel import Hotel, Room, RoomAssignment, RoomType
from app.models.notification import EmailOutbox, EmailTemplate
from app.models.organization import Employee, Site, Team
from app.models.rag import ChatMessage, ChatSession, KnowledgeDocument, RagChunk, RagDocument
from app.models.registration import Registration, RegistrationTransportNeed
from app.models.schedule import Announcement, ScheduleItem
from app.models.system import AllocationRun, Job
from app.services.gala.gala_service import auto_table_position

EVENT_CODE = "TBLAB"
START = date(2027, 3, 15)
END = date(2027, 3, 17)
OUT_DAY = datetime.combine(START, datetime.min.time())
IN_DAY = datetime.combine(END, datetime.min.time())

TEAMS = [("LAB-ALPHA", "Lab Alpha"), ("LAB-BETA", "Lab Beta"),
         ("LAB-GAMMA", "Lab Gamma"), ("LAB-DELTA", "Lab Delta")]

# (code, team, site, shift, registration, pickup_code, role)
#   registration: "join" = submitted + participating, "decline" = submitted +
#   not participating, "cancel" = cancelled, "none" = never opened the form.
#   pickup_code None on a "join" row = needs the bus but picked no pickup point.
PEOPLE = [
    ("LAB001", "LAB-ALPHA", "HN",  "CA1", "join",    "HN-A", UserRole.team_leader),
    ("LAB002", "LAB-ALPHA", "HN",  "CA1", "join",    "HN-A", UserRole.employee),
    ("LAB003", "LAB-ALPHA", "HN",  "CA1", "join",    "HN-B", UserRole.employee),
    ("LAB004", "LAB-ALPHA", "HN",  "CA1", "join",    None,   UserRole.employee),
    ("LAB005", "LAB-BETA",  "HN",  "CA1", "join",    "HN-A", UserRole.team_leader),
    ("LAB006", "LAB-BETA",  "HN",  "CA1", "join",    "HN-A", UserRole.employee),
    ("LAB007", "LAB-BETA",  "HN",  "CA2", "join",    "HN-B", UserRole.employee),
    ("LAB008", "LAB-GAMMA", "HN",  "CA2", "join",    "HN-A", UserRole.team_leader),
    ("LAB009", "LAB-GAMMA", "HN",  "CA2", "join",    "HN-A", UserRole.employee),
    ("LAB010", "LAB-DELTA", "HCM", "CA1", "join",    "SG-A", UserRole.team_leader),
    ("LAB011", "LAB-DELTA", "HCM", "CA1", "join",    "SG-A", UserRole.employee),
    ("LAB012", "LAB-DELTA", "HCM", "CA1", "join",    "SG-B", UserRole.employee),
    ("LAB013", "LAB-DELTA", "HCM", "CA1", "join",    "SG-B", UserRole.employee),
    ("LAB014", "LAB-DELTA", "HCM", "CA2", "join",    "SG-A", UserRole.employee),
    ("LAB015", "LAB-GAMMA", "HCM", "CA1", "join",    "SG-A", UserRole.employee),
    ("LAB016", "LAB-GAMMA", "HCM", "CA1", "join",    "SG-A", UserRole.employee),
    ("LAB017", "LAB-ALPHA", "HN",  None,  "decline", None,   UserRole.employee),
    ("LAB018", "LAB-DELTA", "HCM", None,  "decline", None,   UserRole.employee),
    ("LAB019", "LAB-BETA",  "HN",  "CA1", "cancel",  "HN-A", UserRole.employee),
    ("LAB020", "LAB-GAMMA", "HN",  None,  "none",    None,   UserRole.employee),
    ("LAB021", "LAB-DELTA", "HCM", None,  "none",    None,   UserRole.employee),
    ("LAB022", "LAB-ALPHA", "HN",  None,  "none",    None,   UserRole.employee),
]

# (code, direction, shift, site, capacity, depart, arrive, origin, destination)
# Outbound HN capacity 6+4=10 for 9 people; HCM 5+1=6 for 7 people — short by
# exactly one, so precisely one person comes out `no_slot`. Inbound flights
# carry no shift on purpose (BRD's Ca is an outbound-only concept), which is why
# the same allocator produces zero shift_mismatch flags on the way home.
FLIGHTS = [
    ("LAB-HN1",  "outbound", "CA1", "HN",  6, (8, 0),  (9, 20),  "HAN", "DAD"),
    ("LAB-HN2",  "outbound", "CA2", "HN",  4, (14, 0), (15, 20), "HAN", "DAD"),
    ("LAB-SG1",  "outbound", "CA1", "HCM", 5, (8, 30), (9, 40),  "SGN", "DAD"),
    ("LAB-SG2",  "outbound", "CA2", "HCM", 1, (15, 0), (16, 10), "SGN", "DAD"),
    ("LAB-HN9",  "inbound",  None,  "HN",  5, (16, 0), (17, 20), "DAD", "HAN"),
    ("LAB-HN10", "inbound",  None,  "HN",  5, (18, 0), (19, 20), "DAD", "HAN"),
    ("LAB-SG9",  "inbound",  None,  "HCM", 7, (17, 0), (18, 10), "DAD", "SGN"),
]

# (leg, code, capacity, depart_h, depart_m, pickup_code, destination)
# Windows bus_greedy enforces: before_flight = [flight.depart-6h, flight.depart-90m],
# after_flight = [flight.arrive, flight.arrive+3h]. Three buses below are
# deliberately unsatisfiable for somebody — see docs/LAB-EVENT.md.
BUSES = [
    # HOME_AIR (before_flight): pickup-point-scoped, home side
    ("HOME_AIR", "LAB-X1", 5,  5, 30, "HN-A", "Sân bay Nội Bài"),
    ("HOME_AIR", "LAB-X2", 3,  5, 30, "HN-B", "Sân bay Nội Bài"),
    ("HOME_AIR", "LAB-X3", 3, 11,  0, "HN-A", "Sân bay Nội Bài"),
    ("HOME_AIR", "LAB-X4", 4,  6,  0, "SG-A", "Sân bay Tân Sơn Nhất"),
    ("HOME_AIR", "LAB-X5", 3,  6,  0, "SG-B", "Sân bay Tân Sơn Nhất"),
    ("HOME_AIR", "LAB-X6", 2,  7, 30, "SG-A", "Sân bay Tân Sơn Nhất"),
    # AIR_HOTEL (after_flight): destination side, no pickup point at all
    ("AIR_HOTEL", "LAB-X7",  12, 10, 0, None, "Lab Beach Resort"),
    ("AIR_HOTEL", "LAB-X8",   4, 16, 0, None, "Lab Beach Resort"),
    ("AIR_HOTEL", "LAB-X9",   4, 17, 0, None, "Lab Beach Resort"),
    # HOTEL_AIR (before_flight, destination side)
    ("HOTEL_AIR", "LAB-X10", 10, 13, 0, None, "Sân bay Đà Nẵng"),
    ("HOTEL_AIR", "LAB-X11",  8, 15, 0, None, "Sân bay Đà Nẵng"),
    # AIR_HOME (after_flight): pickup-point-scoped again, home side
    ("AIR_HOME", "LAB-X12", 4, 17, 45, "HN-A", "Văn phòng Hà Nội"),
    ("AIR_HOME", "LAB-X13", 3, 17, 45, "HN-B", "Văn phòng Hà Nội"),
    ("AIR_HOME", "LAB-X14", 4, 19, 45, "HN-A", "Văn phòng Hà Nội"),
    ("AIR_HOME", "LAB-X15", 3, 19, 45, "HN-B", "Văn phòng Hà Nội"),
    ("AIR_HOME", "LAB-X16", 5, 18, 30, "SG-A", "Văn phòng TP.HCM"),
    ("AIR_HOME", "LAB-X17", 3, 18, 30, "SG-B", "Văn phòng TP.HCM"),
]

LEGS = [
    ("HOME_AIR",  "Nhà/Văn phòng → Sân bay", "outbound", 1, "before_flight"),
    ("AIR_HOTEL", "Sân bay → Khách sạn",     "outbound", 2, "after_flight"),
    ("HOTEL_AIR", "Khách sạn → Sân bay",     "inbound",  1, "before_flight"),
    ("AIR_HOME",  "Sân bay → Nhà/Văn phòng", "inbound",  2, "after_flight"),
]

# 8 doubles + 1 single = 17 beds for 16 people. The single is there so you can
# hit `room_full` (409) in two clicks.
ROOMS = [("201", 2), ("202", 2), ("203", 2), ("204", 2),
         ("205", 2), ("206", 2), ("207", 2), ("208", 2), ("209", 1)]
PRE_ASSIGNED_ROOMS = {  # leaves 6 people unassigned to practise on
    "201": ["LAB001", "LAB002"], "202": ["LAB003", "LAB004"],
    "203": ["LAB005", "LAB006"], "204": ["LAB010", "LAB011"],
    "205": ["LAB012", "LAB013"],
}

TERMS_TEXT = (
    "[LAB] Tôi xác nhận đã đọc và đồng ý quy định chương trình Team Building của "
    "sự kiện thử nghiệm TBLAB. Đây là nội dung dùng để học/debug, không phải quy định thật."
)


async def _reset(db: AsyncSession) -> None:
    event = (await db.execute(select(Event).where(Event.code == EVENT_CODE))).scalar_one_or_none()
    if event is not None:
        eid = event.id
        room_ids = select(Room.id).join(Hotel, Hotel.id == Room.hotel_id).where(Hotel.event_id == eid)
        table_ids = select(GalaTable.id).where(GalaTable.event_id == eid)
        reg_ids = select(Registration.id).where(Registration.event_id == eid)
        session_ids = select(ChatSession.id).where(ChatSession.event_id == eid)
        rag_doc_ids = select(RagDocument.id).where(RagDocument.event_id == eid)
        # children first — PRAGMA foreign_keys=ON is set on every connection
        for stmt in (
            delete(ChatMessage).where(ChatMessage.session_id.in_(session_ids)),
            delete(ChatSession).where(ChatSession.event_id == eid),
            delete(RagChunk).where(RagChunk.document_id.in_(rag_doc_ids)),
            delete(RagDocument).where(RagDocument.event_id == eid),
            delete(KnowledgeDocument).where(KnowledgeDocument.event_id == eid),
            delete(GalaSeat).where(GalaSeat.table_id.in_(table_ids)),
            delete(GalaTurn).where(GalaTurn.event_id == eid),
            delete(GalaTable).where(GalaTable.event_id == eid),
            delete(GalaConfig).where(GalaConfig.event_id == eid),
            delete(BusAssignment).where(BusAssignment.event_id == eid),
            delete(Bus).where(Bus.event_id == eid),
            delete(FlightAssignment).where(FlightAssignment.event_id == eid),
            delete(Flight).where(Flight.event_id == eid),
            delete(RoomAssignment).where(RoomAssignment.event_id == eid),
            delete(Room).where(Room.id.in_(room_ids)),
            delete(RoomType).where(RoomType.hotel_id.in_(select(Hotel.id).where(Hotel.event_id == eid))),
            delete(Hotel).where(Hotel.event_id == eid),
            delete(RegistrationTransportNeed).where(RegistrationTransportNeed.registration_id.in_(reg_ids)),
            delete(Registration).where(Registration.event_id == eid),
            delete(ScheduleItem).where(ScheduleItem.event_id == eid),
            delete(Announcement).where(Announcement.event_id == eid),
            delete(EmailOutbox).where(EmailOutbox.event_id == eid),
            delete(EmailTemplate).where(EmailTemplate.event_id == eid),
            delete(AuditLog).where(AuditLog.event_id == eid),
            delete(AllocationRun).where(AllocationRun.event_id == eid),
            delete(EventSetting).where(EventSetting.event_id == eid),
            delete(PickupPoint).where(PickupPoint.event_id == eid),
            delete(TransportLeg).where(TransportLeg.event_id == eid),
            delete(Shift).where(Shift.event_id == eid),
            delete(Event).where(Event.id == eid),
        ):
            await db.execute(stmt)

    lab_employee_ids = select(Employee.id).where(Employee.employee_code.like("LAB%"))
    lab_user_ids = select(User.id).where(User.employee_id.in_(lab_employee_ids))
    await db.execute(delete(RefreshToken).where(RefreshToken.user_id.in_(lab_user_ids)))
    await db.execute(delete(AuditLog).where(AuditLog.actor_user_id.in_(lab_user_ids)))
    await db.execute(delete(Job).where(Job.created_by.in_(lab_user_ids)))
    await db.execute(delete(User).where(User.employee_id.in_(lab_employee_ids)))
    await db.execute(delete(Employee).where(Employee.employee_code.like("LAB%")))
    await db.execute(delete(Team).where(Team.code.like("LAB-%")))
    await db.commit()
    print("reset: TBLAB and every LAB* row removed")


async def build(db: AsyncSession) -> None:
    if (await db.execute(select(Event).where(Event.code == EVENT_CODE))).scalar_one_or_none():
        print(f"{EVENT_CODE} already exists — run with --reset to rebuild it")
        return

    sites: dict[str, Site] = {}
    for code, name in (("HN", "Hà Nội"), ("HCM", "Hồ Chí Minh")):
        site = (await db.execute(select(Site).where(Site.code == code))).scalar_one_or_none()
        if site is None:
            site = Site(code=code, name=name)
            db.add(site)
            await db.flush()
        sites[code] = site

    teams = {code: Team(code=code, name=name) for code, name in TEAMS}
    db.add_all(list(teams.values()))
    await db.flush()

    now = utcnow()
    event = Event(
        code=EVENT_CODE, name="TBLAB — Sự kiện học & debug",
        description=(
            "16 người tham gia, mọi nhánh thuật toán phân bổ đều được kích hoạt đúng một lần. "
            "Xem docs/LAB-EVENT.md để biết kết quả mong đợi và cách quan sát từng nhánh."
        ),
        start_date=START, end_date=END, destination="Đà Nẵng (lab)",
        status=EventStatus.registration_closed,
        # window kept open around today so flipping back to registration_open
        # for practising the CBNV flow works without editing dates
        registration_open_at=now - timedelta(days=30),
        registration_close_at=now + timedelta(days=60),
    )
    db.add(event)
    await db.flush()

    shifts = {
        "CA1": Shift(event_id=event.id, code="CA1", name="Ca 1", sort_order=1),
        "CA2": Shift(event_id=event.id, code="CA2", name="Ca 2", depart_after_time="13:00",
                     description="Ca bay buổi chiều", sort_order=2),
    }
    db.add_all(list(shifts.values()))
    legs = {
        code: TransportLeg(event_id=event.id, code=code, name=name, direction=direction,
                           sort_order=order, flight_timing=timing)
        for code, name, direction, order, timing in LEGS
    }
    db.add_all(list(legs.values()))
    pickups = {
        "HN-A": PickupPoint(event_id=event.id, site_id=sites["HN"].id, name="Lab Toà A - Cầu Giấy",
                            address="1 Cầu Giấy, Hà Nội"),
        "HN-B": PickupPoint(event_id=event.id, site_id=sites["HN"].id, name="Lab Toà B - Trung Hoà",
                            address="2 Trung Hoà, Hà Nội"),
        "SG-A": PickupPoint(event_id=event.id, site_id=sites["HCM"].id, name="Lab Toà C - Quận 1",
                            address="1 Quận 1, TP.HCM"),
        "SG-B": PickupPoint(event_id=event.id, site_id=sites["HCM"].id, name="Lab Toà D - Quận 7",
                            address="2 Quận 7, TP.HCM"),
    }
    db.add_all(list(pickups.values()))
    await db.flush()

    for code, direction, shift, site, capacity, dep, arr in [
        (f[0], f[1], f[2], f[3], f[4], f[5], f[6]) for f in FLIGHTS
    ]:
        day = OUT_DAY if direction == "outbound" else IN_DAY
        spec = next(f for f in FLIGHTS if f[0] == code)
        db.add(Flight(
            event_id=event.id, flight_code=code, airline="Lab Air", direction=direction,
            shift_id=shifts[shift].id if shift else None, site_id=sites[site].id,
            capacity=capacity,
            depart_at=day.replace(hour=dep[0], minute=dep[1]),
            arrive_at=day.replace(hour=arr[0], minute=arr[1]),
            origin=spec[7], destination=spec[8],
        ))

    for leg_code, code, capacity, hour, minute, pickup, destination in BUSES:
        day = OUT_DAY if legs[leg_code].direction == "outbound" else IN_DAY
        depart_at = day.replace(hour=hour, minute=minute)
        db.add(Bus(
            event_id=event.id, leg_id=legs[leg_code].id, code=code, capacity=capacity,
            gather_at=depart_at - timedelta(minutes=15), depart_at=depart_at,
            pickup_point_id=pickups[pickup].id if pickup else None,
            destination=destination, leader_name="Trưởng xe Lab", leader_phone="0900000000",
        ))

    hotel = Hotel(event_id=event.id, code="LAB-HTL", name="Lab Beach Resort",
                  address="1 Võ Nguyên Giáp, Đà Nẵng", checkin_date=START, checkout_date=END)
    db.add(hotel)
    await db.flush()
    room_type = RoomType(hotel_id=hotel.id, name="Đôi", capacity=2, quantity=8)
    db.add(room_type)
    await db.flush()
    rooms = {}
    for number, capacity in ROOMS:
        room = Room(hotel_id=hotel.id, room_number=number, capacity=capacity,
                    room_type_id=room_type.id if capacity == 2 else None)
        db.add(room)
        rooms[number] = room
    await db.flush()

    employees: dict[str, Employee] = {}
    for code, team, site, shift, reg_kind, pickup, role in PEOPLE:
        employee = Employee(
            employee_code=code, full_name=f"Lab {code}", email=f"{code.lower()}@teambuilding.vn",
            team_id=teams[team].id, site_id=sites[site].id, phone="0900000000",
        )
        db.add(employee)
        await db.flush()
        employees[code] = employee
        db.add(User(employee_id=employee.id, email=employee.email,
                    password_hash=hash_password(code), role=role))

        if reg_kind == "none":
            continue
        reg = Registration(
            event_id=event.id, employee_id=employee.id,
            status="cancelled" if reg_kind == "cancel" else "submitted",
            is_participating=(reg_kind == "join"),
            shift_id=shifts[shift].id if shift and reg_kind == "join" else None,
            agreed_terms_at=now if reg_kind == "join" else None,
            terms_version="lab-v1" if reg_kind == "join" else None,
            submitted_at=now, cancelled_at=now if reg_kind == "cancel" else None,
            cancel_reason="Lab: huỷ để thử luồng" if reg_kind == "cancel" else None,
        )
        db.add(reg)
        await db.flush()
        if reg_kind == "join":
            # needs every leg; the *home* pickup point is recorded on all four —
            # exactly the shape that used to break the two destination legs
            for leg in legs.values():
                db.add(RegistrationTransportNeed(
                    registration_id=reg.id, leg_id=leg.id, is_needed=True,
                    pickup_point_id=pickups[pickup].id if pickup else None,
                ))
    await db.flush()

    for number, codes in PRE_ASSIGNED_ROOMS.items():
        for code in codes:
            db.add(RoomAssignment(event_id=event.id, room_id=rooms[number].id,
                                  employee_id=employees[code].id, source="manual", assigned_at=now))

    # Gala: 3 tables x 6 = 18 seats, 2 blocked -> 16 selectable, and the 16
    # participants give a total quota of exactly 16. Block a third seat and the
    # draw must refuse with not_enough_seats.
    config = GalaConfig(
        event_id=event.id, name="Lab Gala Dinner", stage_label="SÂN KHẤU LAB",
        turn_duration_seconds=30, hold_ttl_seconds=15,
        seat_quota_rule="by_team_size", status="setup",
    )
    db.add(config)
    gala_tables = []
    for i in range(3):
        x, y = auto_table_position(i)
        table = GalaTable(event_id=event.id, code=f"LB{i + 1}", name=f"Bàn Lab {i + 1}",
                          x=x, y=y, seat_count=6)
        db.add(table)
        gala_tables.append(table)
    await db.flush()
    for table in gala_tables:
        for n in range(1, table.seat_count + 1):
            db.add(GalaSeat(table_id=table.id, seat_number=n, label=f"{table.code}-{n}",
                            status="blocked" if (table is gala_tables[-1] and n > 4) else "available"))

    db.add_all([
        EventSetting(event_id=event.id, key="terms_text", value_json=TERMS_TEXT),
        EventSetting(event_id=event.id, key="terms_version", value_json="lab-v1"),
    ])

    def item(day: date, sh: int, sm: int, eh: int, em: int, title: str, where: str, order: int):
        base = datetime.combine(day, datetime.min.time())
        return ScheduleItem(
            event_id=event.id, day_date=day, start_at=base.replace(hour=sh, minute=sm),
            end_at=base.replace(hour=eh, minute=em), title=title, location=where,
            audience="all", sort_order=order, is_published=True,
        )

    db.add_all([
        item(START, 5, 30, 8, 0, "Tập trung & ra sân bay", "Điểm đón theo khu vực", 1),
        item(START, 8, 0, 9, 40, "Bay tới Đà Nẵng", "Nội Bài / Tân Sơn Nhất", 2),
        item(START, 10, 30, 12, 0, "Nhận phòng", "Lab Beach Resort", 3),
        item(START, 19, 0, 21, 30, "Gala Dinner", "Sảnh tiệc Lab", 4),
        item(END, 13, 0, 17, 0, "Trả phòng & về", "Lab Beach Resort", 5),
        Announcement(
            event_id=event.id, title="[LAB] Chào mừng tới sự kiện học/debug",
            body_md=("Sự kiện này dùng để tập debug các luồng phân bổ.\n\n"
                     "Xem `docs/LAB-EVENT.md` để biết kết quả mong đợi của từng thuật toán."),
            is_pinned=True, published_at=now,
        ),
    ])

    await db.commit()
    print(
        f"{EVENT_CODE} created (event_id={event.id}): 22 employees / 16 participants, "
        f"{len(FLIGHTS)} flights, {len(BUSES)} buses, {len(ROOMS)} rooms, gala at 'setup' (chưa bốc thăm).\n"
        "Flights and buses are intentionally UNALLOCATED — run them yourself and compare "
        "against docs/LAB-EVENT.md."
    )


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reset", action="store_true", help="delete TBLAB and all LAB* rows first")
    args = parser.parse_args()
    async with AsyncSessionLocal() as db:
        if args.reset:
            await _reset(db)
        await build(db)


if __name__ == "__main__":
    asyncio.run(main())
