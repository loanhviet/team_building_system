import secrets

import openpyxl
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.auth import User
from app.models.enums import UserRole
from app.models.organization import Employee, Site, Team

REQUIRED_HEADERS = {"full_name", "email"}
KNOWN_HEADERS = {"employee_code", "full_name", "email", "team_code", "site_code", "phone"}
BATCH_SIZE = 200


class RowError(Exception):
    def __init__(self, message: str):
        self.message = message


def parse_rows(file_path: str) -> list[dict]:
    workbook = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
    sheet = workbook.active
    rows_iter = sheet.iter_rows(values_only=True)
    header_row = next(rows_iter, None)
    if header_row is None:
        return []

    headers = [str(h).strip().lower() if h is not None else "" for h in header_row]
    missing = REQUIRED_HEADERS - set(headers)
    if missing:
        raise ValueError(
            f"File thiếu cột bắt buộc: {', '.join(sorted(missing))}. "
            f"Cột hỗ trợ: {', '.join(sorted(KNOWN_HEADERS))}"
        )

    rows = []
    for raw_row in rows_iter:
        if raw_row is None or all(v is None for v in raw_row):
            continue
        row = {headers[i]: raw_row[i] for i in range(len(headers)) if headers[i]}
        rows.append(row)
    return rows


async def _resolve_team_id(db: AsyncSession, team_code: str | None) -> int | None:
    if not team_code:
        return None
    result = await db.execute(select(Team.id).where(Team.code == str(team_code).strip()))
    team_id = result.scalar_one_or_none()
    if team_id is None:
        raise RowError(f"Team code '{team_code}' không tồn tại")
    return team_id


async def _resolve_site_id(db: AsyncSession, site_code: str | None) -> int | None:
    if not site_code:
        return None
    result = await db.execute(select(Site.id).where(Site.code == str(site_code).strip()))
    site_id = result.scalar_one_or_none()
    if site_id is None:
        raise RowError(f"Site code '{site_code}' không tồn tại")
    return site_id


async def _upsert_employee_and_user(db: AsyncSession, row: dict) -> None:
    email = str(row.get("email") or "").strip().lower()
    full_name = str(row.get("full_name") or "").strip()
    if not email or not full_name:
        raise RowError("Thiếu email hoặc họ tên")

    employee_code = str(row["employee_code"]).strip() if row.get("employee_code") else None
    team_id = await _resolve_team_id(db, row.get("team_code"))
    site_id = await _resolve_site_id(db, row.get("site_code"))
    phone = str(row["phone"]).strip() if row.get("phone") else None

    result = await db.execute(select(Employee).where(Employee.email == email))
    employee = result.scalar_one_or_none()
    if employee is None:
        employee = Employee(
            employee_code=employee_code,
            full_name=full_name,
            email=email,
            team_id=team_id,
            site_id=site_id,
            phone=phone,
        )
        db.add(employee)
    else:
        employee.full_name = full_name
        employee.employee_code = employee_code or employee.employee_code
        employee.team_id = team_id if team_id is not None else employee.team_id
        employee.site_id = site_id if site_id is not None else employee.site_id
        employee.phone = phone or employee.phone
    await db.flush()

    user_result = await db.execute(select(User).where(User.email == email))
    user = user_result.scalar_one_or_none()
    if user is None:
        initial_password = employee_code or secrets.token_hex(4)
        db.add(
            User(
                employee_id=employee.id,
                email=email,
                password_hash=hash_password(initial_password),
                role=UserRole.employee,
                must_change_password=True,
            )
        )
    elif user.employee_id is None:
        user.employee_id = employee.id


async def import_employees(db: AsyncSession, file_path: str) -> tuple[int, int, list[dict]]:
    rows = parse_rows(file_path)
    ok_rows = 0
    errors: list[dict] = []

    for index, row in enumerate(rows, start=2):  # row 1 is header
        try:
            async with db.begin_nested():
                await _upsert_employee_and_user(db, row)
            ok_rows += 1
        except RowError as exc:
            errors.append({"row": index, "error": exc.message})
        except Exception as exc:  # noqa: BLE001
            errors.append({"row": index, "error": str(exc)})

        if (ok_rows + len(errors)) % BATCH_SIZE == 0:
            await db.commit()

    await db.commit()
    return ok_rows, len(errors), errors
