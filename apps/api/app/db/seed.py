"""Demo data for local/dev use. See docs/REBUILD-PLAN.md §R0 for why this exists:
the previous version of this script produced a single empty draft event with no
shifts, legs, pickup points or flights — every screen in the app rendered empty.

Seeds two events:
  - TB2026 ("information_published"): fully operational — shifts, all 4 transport
    legs (tagged with `flight_timing`), pickup points, 10 flights (both directions,
    Hanoi <-> Đà Nẵng and Hồ Chí Minh <-> Đà Nẵng, each `Flight.site_id`-tagged)
    with real times/airports, hotel+rooms, buses with gather/pickup/leader times
    chosen to line up with those flights, ~105 registrations run through the real
    allocation functions, a partially-drawn Gala floor plan, a 3-day schedule, and
    announcements. HCM flight capacity is intentionally a bit tight so some
    registrations come out `is_flagged` — BTC has something real to resolve, per
    BRD §5.3.
  - TB2027 ("registration_open"): same shift/leg/pickup-point configuration,
    zero registrations — for exercising the CBNV registration flow from scratch.

Run: `docker compose exec api python -m app.db.seed`
Reset first: `docker compose exec api python -m app.db.seed --reset`
"""

import argparse
import asyncio
import itertools
import random
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.core.time import utcnow
from app.db.base import Base
from app.db.knowledge_pack import KNOWLEDGE_FAQS, TERMS_TEXT, TERMS_VERSION
from app.db.session import AsyncSessionLocal, engine
from app.models.auth import User
from app.models.bus import Bus
from app.models.enums import EventStatus, UserRole
from app.models.event import Event, PickupPoint, Shift, TransportLeg
from app.models.flight import Flight
from app.models.gala import GalaConfig, GalaSeat, GalaTable, GalaTurn
from app.models.hotel import Hotel, Room, RoomAssignment, RoomType
from app.models.organization import Employee, Site, Team
from app.models.rag import KnowledgeDocument
from app.models.registration import Registration, RegistrationTransportNeed
from app.models.schedule import Announcement, ScheduleItem
from app.models.system import AllocationRun
from app.services.allocation.bus_runner import run_bus_allocation
from app.services.allocation.runner import run_flight_allocation
from app.services.event_service import get_setting, upsert_setting
from app.services.gala.gala_service import auto_table_position

LAST_NAMES = ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Huỳnh", "Vũ", "Đặng", "Bùi", "Đỗ"]
MIDDLE_NAMES = ["Văn", "Thị", "Hữu", "Minh", "Ngọc", "Đức", "Thanh", "Xuân"]
FIRST_NAMES = [
    "An", "Bình", "Chi", "Dũng", "Giang", "Hà", "Hải", "Huy", "Khánh", "Lan",
    "Linh", "Long", "Mai", "Nam", "Ngân", "Phong", "Quân", "Quang", "Sơn", "Thảo",
    "Thắng", "Trang", "Trung", "Tuấn", "Vy", "Yến",
]

TEAM_DEFS = [
    ("ENG", "Engineering"), ("SALES", "Sales"), ("MKT", "Marketing"), ("HR", "Human Resources"),
    ("FIN", "Finance"), ("OPS", "Operations"), ("CS", "Customer Success"), ("PROD", "Product"),
]

EMPLOYEE_COUNT = 120
REGISTERED_COUNT = 105  # rest (15) are seeded as "never registered"
DECLINE_COUNT = 8  # of REGISTERED_COUNT, how many chose "Không tham gia"

# Default seed on a fresh clone: login accounts covering every role, nothing
# else pre-built — no event, no flights/buses/hotel/Gala. A tester is meant
# to click "Tạo sự kiện" and configure it themselves through the real admin
# screens, which is a more honest test of those screens than only ever
# looking at data a script already built. The full operational demo (an
# event with real flights/buses/Gala run through actual allocation) is still
# here — opt in with `--full` — for whoever wants to see the system already
# working at a realistic scale instead of building one up by hand.
MINIMAL_EMPLOYEE_COUNT = 4
MINIMAL_TEAM_DEFS = TEAM_DEFS[:2]

WISH_NOTES = [
    "Mong có hoạt động team building ngoài trời nhiều hơn năm ngoái.",
    "Đề xuất có thực đơn chay cho một số thành viên.",
    "Xe nên có wifi cho quãng đường dài.",
    "Rất mong chờ Gala Dinner năm nay!",
]


async def reset_all_tables() -> None:
    """Delete every row from every mapped table, FK-safe, without hand-maintaining
    a table list — `Base.metadata.sorted_tables` already knows the dependency
    order; deleting in reverse of it removes children before parents."""
    import app.models  # noqa: F401  (populate Base.metadata with every model)

    async with engine.begin() as conn:
        await conn.exec_driver_sql("PRAGMA foreign_keys=OFF")
        for table in reversed(Base.metadata.sorted_tables):
            await conn.execute(table.delete())
        await conn.exec_driver_sql("PRAGMA foreign_keys=ON")
    print("Reset: all tables cleared.")


def make_full_name(rng: random.Random) -> str:
    return f"{rng.choice(LAST_NAMES)} {rng.choice(MIDDLE_NAMES)} {rng.choice(FIRST_NAMES)}"


async def seed_org(
    db: AsyncSession,
    rng: random.Random,
    *,
    employee_count: int = EMPLOYEE_COUNT,
    team_defs: list[tuple[str, str]] = TEAM_DEFS,
) -> tuple[list[Site], list[Team], list[Employee]]:
    sites = [Site(code="HN", name="Hà Nội"), Site(code="HCM", name="Hồ Chí Minh")]
    db.add_all(sites)
    teams = [Team(code=code, name=name) for code, name in team_defs]
    db.add_all(teams)
    await db.flush()

    db.add(User(email="admin@teambuilding.vn", password_hash=hash_password("admin123"), role=UserRole.super_admin))
    db.add(User(email="btc@teambuilding.vn", password_hash=hash_password("btc123"), role=UserRole.organizer))

    employees: list[Employee] = []
    leader_assigned: set[int] = set()
    for i in range(1, employee_count + 1):
        employee_code = f"NV{i:03d}"
        team = teams[i % len(teams)]
        site = sites[i % len(sites)]
        employee = Employee(
            employee_code=employee_code,
            full_name=make_full_name(rng),
            email=f"nv{i:03d}@teambuilding.vn",
            team_id=team.id,
            site_id=site.id,
            phone=f"09{rng.randint(10000000, 99999999)}",
        )
        db.add(employee)
        await db.flush()
        employees.append(employee)

        # one team_leader per team (the first employee assigned to that team),
        # everyone else is a plain employee
        role = UserRole.employee
        if team.id not in leader_assigned:
            role = UserRole.team_leader
            leader_assigned.add(team.id)
        db.add(
            User(
                employee_id=employee.id, email=employee.email,
                password_hash=hash_password(employee_code), role=role,
                must_change_password=True,
            )
        )

    await db.flush()
    return sites, teams, employees


async def seed_event_config(
    db: AsyncSession, event: Event, sites: list[Site]
) -> tuple[list[Shift], list[TransportLeg], list[PickupPoint]]:
    """Shifts, the 4 BRD §7.1 transport legs, and per-site pickup points — the
    master data every registration/allocation screen depends on."""
    shifts = [
        Shift(event_id=event.id, code="CA1", name="Ca 1", sort_order=1),
        Shift(event_id=event.id, code="CA2", name="Ca 2", depart_after_time="17:00", sort_order=2,
              description="Ca bay sau giờ giao dịch, dự kiến sau 17h00"),
    ]
    db.add_all(shifts)

    legs = [
        TransportLeg(event_id=event.id, code="HN_SB", name="Nhà/Văn phòng → Sân bay", direction="outbound", sort_order=1, flight_timing="before_flight"),
        TransportLeg(event_id=event.id, code="SB_KS", name="Sân bay → Khách sạn", direction="outbound", sort_order=2, flight_timing="after_flight"),
        TransportLeg(event_id=event.id, code="KS_SB", name="Khách sạn → Sân bay", direction="inbound", sort_order=1, flight_timing="before_flight"),
        TransportLeg(event_id=event.id, code="SB_HN", name="Sân bay → Nhà/Văn phòng", direction="inbound", sort_order=2, flight_timing="after_flight"),
    ]
    db.add_all(legs)
    await db.flush()

    hn = next(s for s in sites if s.code == "HN")
    hcm = next(s for s in sites if s.code == "HCM")
    pickup_points = [
        PickupPoint(event_id=event.id, site_id=hn.id, name="Toà nhà A - Cầu Giấy", address="Số 1 Cầu Giấy, Hà Nội"),
        PickupPoint(event_id=event.id, site_id=hn.id, name="Toà nhà B - Trung Hoà", address="Số 2 Trung Hoà, Hà Nội"),
        PickupPoint(event_id=event.id, site_id=hcm.id, name="Toà nhà C - Quận 1", address="Số 1 Quận 1, TP.HCM"),
        PickupPoint(event_id=event.id, site_id=hcm.id, name="Toà nhà D - Quận 7", address="Số 2 Quận 7, TP.HCM"),
    ]
    db.add_all(pickup_points)
    await db.flush()
    return shifts, legs, pickup_points


async def seed_flights(
    db: AsyncSession, event: Event, shifts: list[Shift], sites: list[Site]
) -> list[Flight]:
    ca1 = next(s for s in shifts if s.code == "CA1")
    ca2 = next(s for s in shifts if s.code == "CA2")
    hn = next(s for s in sites if s.code == "HN")
    hcm = next(s for s in sites if s.code == "HCM")
    out_day = datetime.combine(event.start_date, datetime.min.time())
    in_day = datetime.combine(event.end_date, datetime.min.time())

    flights = [
        # Hanoi <-> Đà Nẵng
        Flight(event_id=event.id, flight_code="VN001", airline="Vietnam Airlines", direction="outbound",
               shift_id=ca1.id, site_id=hn.id, depart_at=out_day.replace(hour=6), arrive_at=out_day.replace(hour=7, minute=20),
               origin="Sân bay Nội Bài (HAN)", destination="Sân bay Đà Nẵng (DAD)", capacity=35),
        Flight(event_id=event.id, flight_code="VN003", airline="Vietnam Airlines", direction="outbound",
               shift_id=ca1.id, site_id=hn.id, depart_at=out_day.replace(hour=6, minute=45), arrive_at=out_day.replace(hour=8, minute=5),
               origin="Sân bay Nội Bài (HAN)", destination="Sân bay Đà Nẵng (DAD)", capacity=35),
        Flight(event_id=event.id, flight_code="VJ205", airline="Vietjet Air", direction="outbound",
               shift_id=ca2.id, site_id=hn.id, depart_at=out_day.replace(hour=18), arrive_at=out_day.replace(hour=19, minute=20),
               origin="Sân bay Nội Bài (HAN)", destination="Sân bay Đà Nẵng (DAD)", capacity=22),
        Flight(event_id=event.id, flight_code="VN101", airline="Vietnam Airlines", direction="inbound",
               site_id=hn.id, depart_at=in_day.replace(hour=15), arrive_at=in_day.replace(hour=16, minute=20),
               origin="Sân bay Đà Nẵng (DAD)", destination="Sân bay Nội Bài (HAN)", capacity=35),
        Flight(event_id=event.id, flight_code="VN103", airline="Vietnam Airlines", direction="inbound",
               site_id=hn.id, depart_at=in_day.replace(hour=15, minute=45), arrive_at=in_day.replace(hour=17, minute=5),
               origin="Sân bay Đà Nẵng (DAD)", destination="Sân bay Nội Bài (HAN)", capacity=35),
        Flight(event_id=event.id, flight_code="VJ208", airline="Vietjet Air", direction="inbound",
               site_id=hn.id, depart_at=in_day.replace(hour=19), arrive_at=in_day.replace(hour=20, minute=20),
               origin="Sân bay Đà Nẵng (DAD)", destination="Sân bay Nội Bài (HAN)", capacity=30),
        # Hồ Chí Minh <-> Đà Nẵng — was missing entirely before R7 (audit found
        # every HCM employee getting auto-booked out of Hanoi); capacity is
        # intentionally a bit tight (48 < ~49 participating) so BTC still has
        # a real no_slot case to resolve, same idea as the HN side used to have
        Flight(event_id=event.id, flight_code="VJ601", airline="Vietjet Air", direction="outbound",
               shift_id=ca1.id, site_id=hcm.id, depart_at=out_day.replace(hour=6, minute=30), arrive_at=out_day.replace(hour=7, minute=50),
               origin="Sân bay Tân Sơn Nhất (SGN)", destination="Sân bay Đà Nẵng (DAD)", capacity=30),
        Flight(event_id=event.id, flight_code="VN603", airline="Vietnam Airlines", direction="outbound",
               shift_id=ca2.id, site_id=hcm.id, depart_at=out_day.replace(hour=18, minute=15), arrive_at=out_day.replace(hour=19, minute=35),
               origin="Sân bay Tân Sơn Nhất (SGN)", destination="Sân bay Đà Nẵng (DAD)", capacity=18),
        Flight(event_id=event.id, flight_code="VN701", airline="Vietnam Airlines", direction="inbound",
               site_id=hcm.id, depart_at=in_day.replace(hour=15, minute=30), arrive_at=in_day.replace(hour=16, minute=50),
               origin="Sân bay Đà Nẵng (DAD)", destination="Sân bay Tân Sơn Nhất (SGN)", capacity=30),
        Flight(event_id=event.id, flight_code="VJ702", airline="Vietjet Air", direction="inbound",
               site_id=hcm.id, depart_at=in_day.replace(hour=19, minute=30), arrive_at=in_day.replace(hour=20, minute=50),
               origin="Sân bay Đà Nẵng (DAD)", destination="Sân bay Tân Sơn Nhất (SGN)", capacity=18),
    ]
    db.add_all(flights)
    await db.flush()
    return flights


async def seed_hotel(db: AsyncSession, event: Event) -> tuple[Hotel, list[Room]]:
    hotel = Hotel(
        event_id=event.id, code="DBR", name="Danang Beach Resort", address="36 Võ Nguyên Giáp, Đà Nẵng",
        checkin_date=event.start_date, checkout_date=event.end_date,
    )
    db.add(hotel)
    await db.flush()

    double = RoomType(hotel_id=hotel.id, name="Phòng Đôi", capacity=2, quantity=40)
    triple = RoomType(hotel_id=hotel.id, name="Phòng Ba", capacity=3, quantity=10)
    db.add_all([double, triple])
    await db.flush()

    rooms = [
        Room(hotel_id=hotel.id, room_type_id=double.id, room_number=str(101 + i), capacity=2)
        for i in range(40)
    ] + [
        Room(hotel_id=hotel.id, room_type_id=triple.id, room_number=str(201 + i), capacity=3)
        for i in range(10)
    ]
    db.add_all(rooms)
    await db.flush()
    return hotel, rooms


async def seed_buses(db: AsyncSession, event: Event, legs: list[TransportLeg], pickup_points: list[PickupPoint]) -> list[Bus]:
    out_day = datetime.combine(event.start_date, datetime.min.time())
    in_day = datetime.combine(event.end_date, datetime.min.time())
    leg_by_code = {leg.code: leg for leg in legs}
    leaders = [
        ("Nguyễn Văn Tài", "0911111111"), ("Trần Thị Hương", "0922222222"),
        ("Lê Văn Sơn", "0933333333"), ("Phạm Thị Lan", "0944444444"),
        ("Hoàng Văn Đức", "0955555555"), ("Vũ Thị Mai", "0966666666"),
        ("Đặng Văn Long", "0977777777"), ("Bùi Thị Nga", "0988888888"),
        ("Đỗ Văn Kiên", "0999999999"), ("Ngô Thị Hoa", "0900000001"),
        ("Phan Văn Tùng", "0900000002"), ("Vương Thị Yến", "0900000003"),
    ]
    leader_iter = itertools.cycle(leaders)  # 15 buses now, only 12 named leaders

    # seed_event_config creates pickup_points as [HN, HN, HCM, HCM] in that order
    hn_points, hcm_points = pickup_points[:2], pickup_points[2:]

    # gather_at is 15min before depart_at (below); every gather time here is
    # picked so depart_at lands inside bus_greedy's flight-timing window for
    # the flight(s) it's meant to serve (see docs/REBUILD-PLAN.md §R7) —
    # before_flight: [flight.depart_at-6h, flight.depart_at-90min];
    # after_flight: [flight.arrive_at, flight.arrive_at+3h]. HN legs serve
    # VN001/VN003/VJ205 (out) + VN101/VN103/VJ208 (in); HCM legs serve
    # VJ601/VN603 (out) + VN701/VJ702 (in) — see seed_flights.
    #
    # Registration picks one of a site's 2 pickup points at random (see
    # seed_registrations), so HN_SB/SB_HN each need a bus per (site, pickup
    # point, timeslot) — one bus per site per slot isn't enough coverage,
    # it just leaves whichever point that bus *didn't* take flagged
    # no_compatible_bus for every person on the other point.
    specs = [
        # (leg_code, code, capacity, gather_at, destination, pickup_point)
        ("HN_SB", "XE-HN1A", 22, out_day.replace(hour=3, minute=45), "Sân bay Nội Bài", hn_points[0]),
        ("HN_SB", "XE-HN1B", 22, out_day.replace(hour=3, minute=45), "Sân bay Nội Bài", hn_points[-1]),
        ("HN_SB", "XE-HN2A", 15, out_day.replace(hour=15, minute=15), "Sân bay Nội Bài", hn_points[0]),
        ("HN_SB", "XE-HN2B", 15, out_day.replace(hour=15, minute=15), "Sân bay Nội Bài", hn_points[-1]),
        ("HN_SB", "XE-HCM1A", 18, out_day.replace(hour=4), "Sân bay Tân Sơn Nhất", hcm_points[0]),
        ("HN_SB", "XE-HCM1B", 18, out_day.replace(hour=4), "Sân bay Tân Sơn Nhất", hcm_points[-1]),
        ("HN_SB", "XE-HCM2A", 12, out_day.replace(hour=15, minute=45), "Sân bay Tân Sơn Nhất", hcm_points[0]),
        ("HN_SB", "XE-HCM2B", 12, out_day.replace(hour=15, minute=45), "Sân bay Tân Sơn Nhất", hcm_points[-1]),
        ("SB_KS", "XE-DAD1", 40, out_day.replace(hour=7, minute=15), "Danang Beach Resort", None),
        ("SB_KS", "XE-DAD2", 70, out_day.replace(hour=8, minute=15), "Danang Beach Resort", None),
        ("SB_KS", "XE-DAD3", 45, out_day.replace(hour=19, minute=30), "Danang Beach Resort", None),
        ("KS_SB", "XE-DAD4", 40, in_day.replace(hour=12, minute=15), "Sân bay Đà Nẵng", None),
        ("KS_SB", "XE-DAD5", 70, in_day.replace(hour=12, minute=45), "Sân bay Đà Nẵng", None),
        ("KS_SB", "XE-DAD6", 55, in_day.replace(hour=16, minute=45), "Sân bay Đà Nẵng", None),
        ("SB_HN", "XE-HN3A", 22, in_day.replace(hour=16, minute=30), "Văn phòng Hà Nội", hn_points[0]),
        ("SB_HN", "XE-HN3B", 22, in_day.replace(hour=16, minute=30), "Văn phòng Hà Nội", hn_points[-1]),
        ("SB_HN", "XE-HN4A", 22, in_day.replace(hour=17, minute=15), "Văn phòng Hà Nội", hn_points[0]),
        ("SB_HN", "XE-HN4B", 22, in_day.replace(hour=17, minute=15), "Văn phòng Hà Nội", hn_points[-1]),
        ("SB_HN", "XE-HN5A", 18, in_day.replace(hour=20, minute=30), "Văn phòng Hà Nội", hn_points[0]),
        ("SB_HN", "XE-HN5B", 18, in_day.replace(hour=20, minute=30), "Văn phòng Hà Nội", hn_points[-1]),
        ("SB_HN", "XE-HCM3A", 18, in_day.replace(hour=17), "Văn phòng TP.HCM", hcm_points[0]),
        ("SB_HN", "XE-HCM3B", 18, in_day.replace(hour=17), "Văn phòng TP.HCM", hcm_points[-1]),
        ("SB_HN", "XE-HCM4A", 12, in_day.replace(hour=21), "Văn phòng TP.HCM", hcm_points[0]),
        ("SB_HN", "XE-HCM4B", 12, in_day.replace(hour=21), "Văn phòng TP.HCM", hcm_points[-1]),
    ]

    buses = []
    for leg_code, code, capacity, gather_at, destination, pickup in specs:
        leader_name, leader_phone = next(leader_iter)
        buses.append(
            Bus(
                event_id=event.id, leg_id=leg_by_code[leg_code].id, code=code, capacity=capacity,
                gather_at=gather_at, depart_at=gather_at + timedelta(minutes=15),
                pickup_point_id=pickup.id if pickup else None, destination=destination,
                leader_name=leader_name, leader_phone=leader_phone,
            )
        )
    db.add_all(buses)
    await db.flush()
    return buses


async def seed_registrations(
    db: AsyncSession, event: Event, employees: list[Employee], legs: list[TransportLeg],
    pickup_points: list[PickupPoint], shifts: list[Shift], rng: random.Random,
) -> tuple[list[Registration], dict[int, int]]:
    """Returns the created registrations and a team_id -> participating_count map
    (used later to size Gala turn quotas without a second DB round-trip)."""
    ca1, ca2 = shifts[0], shifts[1]
    points_by_site: dict[int, list[PickupPoint]] = {}
    for p in pickup_points:
        points_by_site.setdefault(p.site_id, []).append(p)

    open_at = utcnow() - timedelta(days=45)
    close_at = utcnow() - timedelta(days=30)

    registrations: list[Registration] = []
    team_participating_count: dict[int, int] = {}

    for idx, employee in enumerate(employees[:REGISTERED_COUNT], start=1):
        is_participating = idx > DECLINE_COUNT  # first DECLINE_COUNT people declined
        submitted_at = open_at + timedelta(hours=rng.randint(1, int((close_at - open_at).total_seconds() // 3600)))
        reg = Registration(
            event_id=event.id, employee_id=employee.id, status="submitted",
            is_participating=is_participating,
            shift_id=(ca1.id if idx % 3 else ca2.id) if is_participating else None,
            agreed_terms_at=submitted_at, terms_version="v1",
            wish_note=rng.choice(WISH_NOTES) if is_participating and idx % 6 == 0 else None,
            submitted_at=submitted_at,
        )
        db.add(reg)
        await db.flush()
        registrations.append(reg)

        if is_participating:
            team_participating_count[employee.team_id] = team_participating_count.get(employee.team_id, 0) + 1
            site_points = points_by_site.get(employee.site_id, pickup_points)
            for leg in legs:
                needed = rng.random() < 0.8
                db.add(
                    RegistrationTransportNeed(
                        registration_id=reg.id, leg_id=leg.id, is_needed=needed,
                        pickup_point_id=rng.choice(site_points).id if needed else None,
                    )
                )

    await db.flush()
    return registrations, team_participating_count


async def seed_gala(
    db: AsyncSession, event: Event, teams: list[Team], team_participating_count: dict[int, int],
    rng: random.Random,
) -> None:
    config = GalaConfig(event_id=event.id, name="Gala Dinner - Team Building 2026", turn_duration_seconds=300)
    db.add(config)
    await db.flush()

    tables = []
    for i in range(15):
        x, y = auto_table_position(i)
        tables.append(GalaTable(event_id=event.id, code=f"B{i + 1}", name=f"Bàn {i + 1}", x=x, y=y, seat_count=8))
    db.add_all(tables)
    await db.flush()

    seats: list[GalaSeat] = []
    for table in tables:
        for n in range(1, table.seat_count + 1):
            seat = GalaSeat(table_id=table.id, seat_number=n, label=f"{table.code}-{n}")
            db.add(seat)
            seats.append(seat)
    await db.flush()

    order = [t.id for t in teams]
    rng.shuffle(order)
    config.draw_seed = rng.randint(0, 2**31 - 1)

    seat_pool = list(seats)
    now = utcnow()
    n_done = 5
    for i, team_id in enumerate(order, start=1):
        quota = team_participating_count.get(team_id, 0)
        if i <= n_done:
            status, started_at, expires_at = "done", now - timedelta(hours=1), now - timedelta(minutes=55)
            take, seat_pool = seat_pool[:quota], seat_pool[quota:]
            for seat in take:
                seat.status = "confirmed"
                seat.team_id = team_id
        elif i == n_done + 1:
            status, started_at, expires_at = "active", now, now + timedelta(seconds=config.turn_duration_seconds)
        else:
            status, started_at, expires_at = "waiting", None, None
        db.add(GalaTurn(event_id=event.id, team_id=team_id, order_no=i, seat_quota=quota,
                         status=status, started_at=started_at, expires_at=expires_at))
    config.status = "in_progress"
    await db.flush()


async def seed_schedule(db: AsyncSession, event: Event) -> None:
    day1, day2, day3 = event.start_date, event.start_date + timedelta(days=1), event.end_date

    def item(day: date, start_h: int, start_m: int, end_h: int, end_m: int, title: str, location: str, order: int) -> ScheduleItem:
        return ScheduleItem(
            event_id=event.id, day_date=day,
            start_at=datetime.combine(day, datetime.min.time()).replace(hour=start_h, minute=start_m),
            end_at=datetime.combine(day, datetime.min.time()).replace(hour=end_h, minute=end_m),
            title=title, location=location, audience="all", sort_order=order, is_published=True,
        )

    items = [
        item(day1, 4, 0, 6, 0, "Tập trung & di chuyển ra sân bay", "Điểm đón theo khu vực", 1),
        item(day1, 6, 0, 8, 5, "Bay tới Đà Nẵng", "Sân bay Nội Bài / Đà Nẵng", 2),
        item(day1, 9, 0, 11, 0, "Nhận phòng khách sạn", "Danang Beach Resort", 3),
        item(day1, 12, 0, 13, 30, "Ăn trưa", "Danang Beach Resort", 4),
        item(day1, 15, 0, 17, 0, "Hoạt động Team Building buổi chiều", "Bãi biển Mỹ Khê", 5),
        item(day1, 18, 30, 21, 0, "Gala Dinner", "Sảnh tiệc Danang Beach Resort", 6),
        item(day2, 8, 0, 11, 30, "Team Building ngoài trời", "Bán đảo Sơn Trà", 7),
        item(day2, 12, 0, 13, 30, "Ăn trưa", "Danang Beach Resort", 8),
        item(day2, 14, 0, 17, 0, "Khám phá Đà Nẵng tự do", "Tự túc", 9),
        item(day2, 18, 0, 20, 0, "Tiệc BBQ tối", "Sân vườn khách sạn", 10),
        item(day3, 7, 0, 9, 0, "Ăn sáng & trả phòng", "Danang Beach Resort", 11),
        item(day3, 12, 30, 20, 20, "Di chuyển ra sân bay & bay về", "Sân bay Đà Nẵng", 12),
    ]
    db.add_all(items)

    announcements = [
        Announcement(event_id=event.id, title="Chào mừng đến với Team Building 2026!",
                     body_md="Ban tổ chức chào mừng toàn thể CBNV tham gia Team Building 2026 tại Đà Nẵng. "
                             "Vui lòng kiểm tra kỹ thông tin chuyến bay, xe và phòng của mình trong mục Hành trình.",
                     is_pinned=True, published_at=utcnow() - timedelta(days=2)),
        Announcement(event_id=event.id, title="Cập nhật giờ tập trung ra sân bay",
                     body_md="Giờ tập trung ra sân bay đã được cập nhật, vui lòng xem lại mục Xe trong Hành trình của bạn.",
                     published_at=utcnow() - timedelta(days=1)),
        Announcement(event_id=event.id, title="Lưu ý mang theo giấy tờ tuỳ thân",
                     body_md="Vui lòng mang theo CCCD/Passport còn hiệu lực khi làm thủ tục bay.",
                     published_at=utcnow()),
    ]
    db.add_all(announcements)
    await db.flush()
    await seed_knowledge(db, event)


async def seed_knowledge(db: AsyncSession, event: Event) -> None:
    """Seed-only demo content (docs/CHAT-RAG.md: pack is AI-generated test
    data, not real policy). Fill-if-empty, never overwrite: a real event with
    its own terms/FAQ (typed by BTC, or copied via "Sao chép từ sự kiện
    khác") must never be clobbered by re-running the seed."""
    has_terms = await get_setting(db, event.id, "terms_text", None) is not None
    if not has_terms:
        await upsert_setting(db, event.id, "terms_text", TERMS_TEXT)
        await upsert_setting(db, event.id, "terms_version", TERMS_VERSION)

    existing = await db.execute(
        select(KnowledgeDocument.id).where(KnowledgeDocument.event_id == event.id).limit(1)
    )
    if existing.scalar_one_or_none() is not None:
        return
    for title, body in KNOWLEDGE_FAQS:
        db.add(
            KnowledgeDocument(
                event_id=event.id, title=title, body_md=body, is_published=True,
            )
        )
    await db.flush()


async def run_allocations(db: AsyncSession, event: Event, legs: list[TransportLeg], organizer_id: int) -> None:
    for direction in ("outbound", "inbound"):
        run = AllocationRun(
            event_id=event.id, type="flight", status="running", created_by=organizer_id,
            params_json={"direction": direction},
        )
        db.add(run)
        await db.flush()
        await run_flight_allocation(db, event.id, direction, None, run.id)

    for leg in legs:
        run = AllocationRun(
            event_id=event.id, type="bus", status="running", created_by=organizer_id,
            params_json={"leg_id": leg.id},
        )
        db.add(run)
        await db.flush()
        await run_bus_allocation(db, event.id, leg.id, run.id)

    await db.flush()


async def assign_rooms(db: AsyncSession, event: Event, registrations: list[Registration], rooms: list[Room], organizer_id: int) -> None:
    participants = [r.employee_id for r in registrations if r.is_participating][:90]
    room_iter = iter(rooms)
    room, remaining = next(room_iter), 0
    now = utcnow()
    for employee_id in participants:
        if remaining <= 0:
            room = next(room_iter)
            remaining = room.capacity
        db.add(RoomAssignment(event_id=event.id, room_id=room.id, employee_id=employee_id,
                               source="manual", assigned_by=organizer_id, assigned_at=now))
        remaining -= 1
    await db.flush()


async def seed_event_b_config(db: AsyncSession, event_b: Event, sites: list[Site]) -> None:
    """Same shift/leg/pickup-point shape as Event A, scoped to Event B, no
    registrations — for exercising the CBNV registration flow end-to-end."""
    await seed_event_config(db, event_b, sites)


async def seed_minimal(db: AsyncSession, rng: random.Random) -> None:
    sites, teams, employees = await seed_org(
        db, rng, employee_count=MINIMAL_EMPLOYEE_COUNT, team_defs=MINIMAL_TEAM_DEFS
    )
    await db.commit()
    leaders = employees[: len(teams)]  # seed_org makes the first employee per team its leader
    print(
        f"Seeded (minimal): 1 super_admin, 1 organizer, {len(sites)} sites, {len(teams)} teams, "
        f"{len(employees)} employees ({len(leaders)} team_leader, {len(employees) - len(leaders)} employee). "
        "No event — create one from the admin UI. Run with --full for a fully populated demo event instead."
    )
    print("Login: admin@teambuilding.vn / admin123 (super_admin)")
    print("       btc@teambuilding.vn / btc123 (organizer)")
    for e in leaders:
        print(f"       {e.email} / {e.employee_code} (team_leader)")
    for e in employees[len(teams):]:
        print(f"       {e.email} / {e.employee_code} (employee)")


async def seed() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true", help="Delete all data before seeding")
    parser.add_argument(
        "--full", action="store_true",
        help="Seed the full operational demo (TB2026 with real flights/buses/hotel/Gala already "
        "allocated, plus empty TB2027) instead of just login accounts.",
    )
    args = parser.parse_args()

    if args.reset:
        await reset_all_tables()

    async with AsyncSessionLocal() as db:
        existing = await db.execute(select(User).where(User.email == "admin@teambuilding.vn"))
        if existing.scalar_one_or_none() is not None:
            print("Seed data already present, skipping (use --reset to reseed).")
            return

        rng = random.Random(42)

        if not args.full:
            await seed_minimal(db, rng)
            return

        sites, teams, employees = await seed_org(db, rng)

        organizer = await db.execute(select(User).where(User.email == "btc@teambuilding.vn"))
        organizer_id = organizer.scalar_one().id

        event_a = Event(
            code="TB2026", name="Team Building 2026", description="Chuyến Team Building thường niên",
            destination="Đà Nẵng", start_date=date(2026, 12, 20), end_date=date(2026, 12, 22),
            status=EventStatus.information_published,
            registration_open_at=utcnow() - timedelta(days=45),
            registration_close_at=utcnow() - timedelta(days=30),
            published_at=utcnow() - timedelta(days=2),
        )
        db.add(event_a)
        await db.flush()

        shifts, legs, pickup_points = await seed_event_config(db, event_a, sites)
        await seed_flights(db, event_a, shifts, sites)
        _hotel, rooms = await seed_hotel(db, event_a)
        await seed_buses(db, event_a, legs, pickup_points)
        registrations, team_participating_count = await seed_registrations(
            db, event_a, employees, legs, pickup_points, shifts, rng
        )
        await run_allocations(db, event_a, legs, organizer_id)
        await assign_rooms(db, event_a, registrations, rooms, organizer_id)
        await seed_gala(db, event_a, teams, team_participating_count, rng)
        await seed_schedule(db, event_a)

        event_b = Event(
            code="TB2027", name="Team Building 2027", description="Chuyến Team Building thường niên",
            destination="Chưa xác định", status=EventStatus.registration_open,
            registration_open_at=utcnow() - timedelta(days=1),
            registration_close_at=utcnow() + timedelta(days=14),
        )
        db.add(event_b)
        await db.flush()
        await seed_event_b_config(db, event_b, sites)
        await seed_knowledge(db, event_b)

        await db.commit()

        participating = sum(1 for r in registrations if r.is_participating)
        print(
            f"Seeded: 1 super_admin, 1 organizer, {len(sites)} sites, {len(teams)} teams "
            f"(1 team_leader each), {EMPLOYEE_COUNT} employees."
        )
        print(
            f"Event A (TB2026, information_published): {len(registrations)}/{EMPLOYEE_COUNT} registered "
            f"({participating} participating), 4 transport legs, 10 flights, 1 hotel, 24 buses, "
            f"15 Gala tables, 12 schedule items, 3 announcements — allocations + Gala draw already run."
        )
        print("Event B (TB2027, registration_open): same config, 0 registrations.")
        print("Login mẫu: admin@teambuilding.vn / admin123 (super_admin)")
        print("            btc@teambuilding.vn / btc123 (organizer)")
        print("            nv001@teambuilding.vn / NV001 (team_leader — 1 per team, first employee of each)")
        print("            nv009@teambuilding.vn / NV009 (employee)")


if __name__ == "__main__":
    asyncio.run(seed())
