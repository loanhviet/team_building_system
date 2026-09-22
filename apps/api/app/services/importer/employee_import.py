import openpyxl
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import generate_temporary_password, hash_password
from app.models.auth import User
from app.models.enums import Gender, UserRole
from app.models.organization import Employee, Site, Team
from app.schemas.organization import EmployeeCreate
from app.services.notification.email_service import enqueue_email

REQUIRED_HEADERS = {"full_name", "email"}
KNOWN_HEADERS = {
    "employee_code",
    "full_name",
    "email",
    "team_code",
    "site_code",
    "phone",
    "gender",
    "position",
    "is_active",
}
BATCH_SIZE = 200
settings = get_settings()


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
    result = await db.execute(
        select(Team.id).where(func.lower(func.trim(Team.code)) == str(team_code).strip().lower(), Team.is_active.is_(True))
    )
    team_id = result.scalar_one_or_none()
    if team_id is None:
        raise RowError(f"Team code '{team_code}' không tồn tại")
    return team_id


async def _resolve_site_id(db: AsyncSession, site_code: str | None) -> int | None:
    if not site_code:
        return None
    result = await db.execute(
        select(Site.id).where(func.lower(func.trim(Site.code)) == str(site_code).strip().lower(), Site.is_active.is_(True))
    )
    site_id = result.scalar_one_or_none()
    if site_id is None:
        raise RowError(f"Site code '{site_code}' không tồn tại")
    return site_id


async def _upsert_employee_and_user(db: AsyncSession, row: dict) -> int | None:
    team_id = await _resolve_team_id(db, row.get("team_code"))
    site_id = await _resolve_site_id(db, row.get("site_code"))
    gender = None
    if row.get("gender") not in (None, ""):
        try:
            gender = Gender(str(row["gender"]).strip().lower())
        except ValueError as exc:
            raise RowError("gender phải là male, female hoặc other") from exc
    active_value = row.get("is_active")
    is_active: bool | None = None
    if active_value not in (None, ""):
        active_raw = str(active_value).strip().lower()
        if active_raw not in {"1", "0", "true", "false", "yes", "no", "có", "không"}:
            raise RowError("is_active phải là 1/0 hoặc true/false")
        is_active = active_raw in {"1", "true", "yes", "có"}

    try:
        normalized = EmployeeCreate.model_validate(
            {
                "employee_code": row.get("employee_code"),
                "full_name": row.get("full_name"),
                "email": row.get("email"),
                "team_id": team_id,
                "site_id": site_id,
                "phone": row.get("phone"),
                "position": row.get("position"),
                "gender": gender,
            }
        )
    except ValidationError as exc:
        first = exc.errors()[0]
        message = str(first.get("msg", "Dữ liệu không hợp lệ")).removeprefix("Value error, ")
        raise RowError(message) from exc

    data = normalized.model_dump()
    email = str(data["email"])
    full_name = data["full_name"]
    employee_code = data["employee_code"]
    phone = data["phone"]
    position = data["position"]

    result = await db.execute(select(Employee).where(func.lower(func.trim(Employee.email)) == email))
    employee = result.scalar_one_or_none()
    if employee_code:
        code_owner = (
            await db.execute(
                select(Employee).where(func.lower(func.trim(Employee.employee_code)) == employee_code.lower())
            )
        ).scalar_one_or_none()
        if code_owner is not None and code_owner.id != (employee.id if employee else None):
            raise RowError("Mã nhân viên đã tồn tại (không phân biệt chữ hoa/thường)")
    if employee is None:
        employee = Employee(
            employee_code=employee_code,
            full_name=full_name,
            email=email,
            team_id=team_id,
            site_id=site_id,
            phone=phone,
            gender=gender,
            position=position,
            is_active=True if is_active is None else is_active,
        )
        db.add(employee)
    else:
        employee.full_name = full_name
        employee.employee_code = employee_code or employee.employee_code
        employee.team_id = team_id if team_id is not None else employee.team_id
        employee.site_id = site_id if site_id is not None else employee.site_id
        employee.phone = phone or employee.phone
        if gender is not None:
            employee.gender = gender
        employee.position = position if position is not None else employee.position
        if is_active is not None:
            employee.is_active = is_active
    await db.flush()

    user_result = await db.execute(select(User).where(func.lower(func.trim(User.email)) == email))
    user = user_result.scalar_one_or_none()
    if user is None:
        initial_password = generate_temporary_password()
        db.add(
            User(
                employee_id=employee.id,
                email=email,
                password_hash=hash_password(initial_password),
                role=UserRole.employee,
                is_active=employee.is_active,
                must_change_password=True,
            )
        )
        return await enqueue_email(
            db,
            event_id=None,
            to_email=email,
            template_code="account_welcome",
            payload={
                "full_name": employee.full_name,
                "email": email,
                "employee_code": employee.employee_code or "",
                "temporary_password": initial_password,
                "app_url": settings.app_base_url,
            },
            dedupe_key=f"account_welcome:{employee.id}",
        )
    elif user.employee_id is None:
        user.employee_id = employee.id
    if user is not None and is_active is not None:
        user.is_active = is_active
    return None


async def import_employees(
    db: AsyncSession, file_path: str
) -> tuple[int, int, list[dict], list[int]]:
    rows = parse_rows(file_path)
    ok_rows = 0
    errors: list[dict] = []
    welcome_outbox_ids: list[int] = []

    for index, row in enumerate(rows, start=2):  # row 1 is header
        try:
            async with db.begin_nested():
                outbox_id = await _upsert_employee_and_user(db, row)
                if outbox_id is not None:
                    welcome_outbox_ids.append(outbox_id)
            ok_rows += 1
        except RowError as exc:
            errors.append({"row": index, "error": exc.message})
        except Exception as exc:  # noqa: BLE001
            errors.append({"row": index, "error": str(exc)})

        if (ok_rows + len(errors)) % BATCH_SIZE == 0:
            await db.commit()

    await db.commit()
    return ok_rows, len(errors), errors, welcome_outbox_ids
