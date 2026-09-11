import asyncio
import random

from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import AsyncSessionLocal
from app.models.auth import User
from app.models.enums import UserRole
from app.models.event import Event
from app.models.organization import Employee, Site, Team

LAST_NAMES = ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Huỳnh", "Vũ", "Đặng", "Bùi", "Đỗ"]
MIDDLE_NAMES = ["Văn", "Thị", "Hữu", "Minh", "Ngọc", "Đức", "Thanh", "Xuân"]
FIRST_NAMES = [
    "An", "Bình", "Chi", "Dũng", "Giang", "Hà", "Hải", "Huy", "Khánh", "Lan",
    "Linh", "Long", "Mai", "Nam", "Ngân", "Phong", "Quân", "Quang", "Sơn", "Thảo",
    "Thắng", "Trang", "Trung", "Tuấn", "Vy", "Yến",
]

TEAM_DEFS = [
    ("ENG", "Engineering"),
    ("SALES", "Sales"),
    ("MKT", "Marketing"),
    ("HR", "Human Resources"),
    ("FIN", "Finance"),
    ("OPS", "Operations"),
    ("CS", "Customer Success"),
    ("PROD", "Product"),
]

EMPLOYEE_COUNT = 120


async def seed() -> None:
    async with AsyncSessionLocal() as db:
        existing = await db.execute(select(User).where(User.email == "admin@teambuilding.vn"))
        if existing.scalar_one_or_none() is not None:
            print("Seed data already present, skipping.")
            return

        db.add(
            User(
                email="admin@teambuilding.vn",
                password_hash=hash_password("admin123"),
                role=UserRole.super_admin,
            )
        )
        db.add(
            User(
                email="btc@teambuilding.vn",
                password_hash=hash_password("btc123"),
                role=UserRole.organizer,
            )
        )

        sites = [Site(code="HN", name="Hà Nội"), Site(code="HCM", name="Hồ Chí Minh")]
        db.add_all(sites)

        teams = [Team(code=code, name=name) for code, name in TEAM_DEFS]
        db.add_all(teams)
        await db.flush()

        rng = random.Random(42)
        for i in range(1, EMPLOYEE_COUNT + 1):
            employee_code = f"NV{i:03d}"
            full_name = (
                f"{rng.choice(LAST_NAMES)} {rng.choice(MIDDLE_NAMES)} {rng.choice(FIRST_NAMES)}"
            )
            team = teams[i % len(teams)]
            site = sites[i % len(sites)]
            employee = Employee(
                employee_code=employee_code,
                full_name=full_name,
                email=f"nv{i:03d}@teambuilding.vn",
                team_id=team.id,
                site_id=site.id,
                phone=f"09{rng.randint(10000000, 99999999)}",
            )
            db.add(employee)
            await db.flush()

            role = UserRole.team_leader if i == 1 else UserRole.employee
            db.add(
                User(
                    employee_id=employee.id,
                    email=employee.email,
                    password_hash=hash_password(employee_code),
                    role=role,
                    must_change_password=True,
                )
            )

        db.add(
            Event(
                code="TB2026",
                name="Team Building 2026",
                description="Chuyến Team Building thường niên",
                destination="Đà Nẵng",
            )
        )

        await db.commit()
        print(
            f"Seeded: 1 super_admin, 1 organizer, {len(sites)} sites, {len(teams)} teams, "
            f"{EMPLOYEE_COUNT} employees (1 team_leader), 1 event."
        )
        print("Login mẫu: admin@teambuilding.vn / admin123 (super_admin)")
        print("            btc@teambuilding.vn / btc123 (organizer)")
        print("            nv001@teambuilding.vn / NV001 (team_leader)")
        print("            nv002@teambuilding.vn / NV002 (employee)")


if __name__ == "__main__":
    asyncio.run(seed())
