import io
import uuid
from pathlib import Path
from typing import Annotated

from arq import ArqRedis
from fastapi import APIRouter, Depends, UploadFile, status
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from sqlalchemy import func, or_, select

from app.core.deps import CurrentUser, DbSession, require_admin
from app.core.errors import AppError
from app.core.queue import get_queue
from app.core.security import hash_password
from app.models.auth import User
from app.models.enums import ImportBatchStatus, JobStatus, UserRole
from app.models.organization import Employee
from app.models.system import ImportBatch, Job
from app.schemas.organization import (
    EmployeeCreate,
    EmployeeListOut,
    EmployeeOut,
    EmployeePhoneUpdate,
    EmployeeUpdate,
)
from app.schemas.system import ImportBatchOut, ImportEnqueuedOut
from app.services import master_data
from app.services.audit_service import record_audit

router = APIRouter(prefix="/employees", tags=["employees"])

AdminUser = Annotated[User, Depends(require_admin)]
UPLOAD_DIR = Path("/data/uploads")


def _employee_out(employee: Employee) -> EmployeeOut:
    return EmployeeOut(
        id=employee.id,
        employee_code=employee.employee_code,
        full_name=employee.full_name,
        email=employee.email,
        team_id=employee.team_id,
        site_id=employee.site_id,
        phone=employee.phone,
        gender=employee.gender.value if employee.gender else None,
        position=employee.position,
        is_active=employee.is_active,
        team_name=employee.team.name if employee.team else None,
        site_name=employee.site.name if employee.site else None,
    )


def _batch_out(batch: ImportBatch) -> ImportBatchOut:
    return ImportBatchOut(
        id=batch.id,
        type=batch.type,
        filename=batch.filename,
        status=batch.status.value,
        total_rows=batch.total_rows,
        ok_rows=batch.ok_rows,
        error_rows=batch.error_rows,
        errors_json=batch.errors_json,
        created_at=batch.created_at,
    )


def _employee_filters(search: str | None, team_id: int | None, site_id: int | None):
    clauses = []
    if search:
        needle = f"%{search.strip()}%"
        clauses.append(
            or_(
                Employee.full_name.ilike(needle),
                Employee.email.ilike(needle),
                Employee.employee_code.ilike(needle),
            )
        )
    if team_id is not None:
        clauses.append(Employee.team_id == team_id)
    if site_id is not None:
        clauses.append(Employee.site_id == site_id)
    return clauses


@router.get("", response_model=EmployeeListOut)
async def list_employees(
    db: DbSession,
    _user: CurrentUser,
    search: str | None = None,
    team_id: int | None = None,
    site_id: int | None = None,
    limit: int = 50,
    offset: int = 0,
) -> EmployeeListOut:
    limit = min(max(limit, 1), 200)
    offset = max(offset, 0)
    clauses = _employee_filters(search, team_id, site_id)
    count_stmt = select(func.count(Employee.id))
    stmt = select(Employee).order_by(Employee.full_name, Employee.id)
    for clause in clauses:
        count_stmt = count_stmt.where(clause)
        stmt = stmt.where(clause)
    total = (await db.execute(count_stmt)).scalar_one()
    result = await db.execute(stmt.offset(offset).limit(limit))
    return EmployeeListOut(
        items=[_employee_out(e) for e in result.scalars().all()],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/export")
async def export_employees(
    db: DbSession,
    _user: AdminUser,
    search: str | None = None,
    team_id: int | None = None,
    site_id: int | None = None,
) -> StreamingResponse:
    clauses = _employee_filters(search, team_id, site_id)
    stmt = select(Employee).order_by(Employee.full_name, Employee.id)
    for clause in clauses:
        stmt = stmt.where(clause)
    result = await db.execute(stmt)
    wb = Workbook()
    ws = wb.active
    ws.title = "CBNV"
    ws.append(["employee_code", "full_name", "email", "team_code", "site_code", "phone"])
    for emp in result.scalars().all():
        ws.append([
            emp.employee_code or "",
            emp.full_name,
            emp.email,
            emp.team.code if emp.team else "",
            emp.site.code if emp.site else "",
            emp.phone or "",
        ])
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=employees.xlsx"},
    )


@router.get("/import-template")
async def download_employee_template(_user: AdminUser) -> StreamingResponse:
    wb = Workbook()
    ws = wb.active
    ws.title = "CBNV"
    ws.append(["employee_code", "full_name", "email", "team_code", "site_code", "phone"])
    ws.append(["NV999", "Nguyen Van A", "nva@company.vn", "MKT", "HN", "0901234567"])
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=employees_template.xlsx"},
    )


@router.get("/me", response_model=EmployeeOut)
async def get_my_profile(db: DbSession, user: CurrentUser) -> EmployeeOut:
    if user.employee_id is None:
        raise AppError(
            "no_employee_record",
            "Tài khoản này không gắn với hồ sơ nhân viên",
            status.HTTP_400_BAD_REQUEST,
        )
    employee = await master_data.get_or_404(db, Employee, user.employee_id)
    return _employee_out(employee)


@router.patch("/me", response_model=EmployeeOut)
async def update_my_phone(
    payload: EmployeePhoneUpdate, db: DbSession, user: CurrentUser
) -> EmployeeOut:
    if user.employee_id is None:
        raise AppError(
            "no_employee_record",
            "Tài khoản này không gắn với hồ sơ nhân viên",
            status.HTTP_400_BAD_REQUEST,
        )
    employee = await master_data.get_or_404(db, Employee, user.employee_id)
    before = {"phone": employee.phone}
    employee.phone = payload.phone
    await record_audit(
        db,
        actor_user_id=user.id,
        action="update_phone",
        entity_type="employee",
        entity_id=employee.id,
        before=before,
        after={"phone": employee.phone},
    )
    await db.commit()
    await db.refresh(employee)
    return _employee_out(employee)


@router.post("", response_model=EmployeeOut, status_code=status.HTTP_201_CREATED)
async def create_employee(payload: EmployeeCreate, db: DbSession, user: AdminUser) -> EmployeeOut:
    data = payload.model_dump()
    data["email"] = data["email"].lower()
    employee = await master_data.create(db, Employee, data)
    initial = employee.employee_code or "ChangeMe1"
    db.add(
        User(
            employee_id=employee.id,
            email=employee.email,
            password_hash=hash_password(initial),
            role=UserRole.employee,
            must_change_password=True,
        )
    )
    await record_audit(
        db, actor_user_id=user.id, action="create", entity_type="employee", entity_id=employee.id,
        after=payload.model_dump(mode="json"),
    )
    await db.commit()
    await db.refresh(employee)
    return _employee_out(employee)


@router.patch("/{employee_id}", response_model=EmployeeOut)
async def update_employee(
    employee_id: int, payload: EmployeeUpdate, db: DbSession, user: AdminUser
) -> EmployeeOut:
    employee = await master_data.get_or_404(db, Employee, employee_id)
    before = _employee_out(employee).model_dump(mode="json")
    await master_data.update(db, employee, payload.model_dump(exclude_unset=True))
    await record_audit(
        db, actor_user_id=user.id, action="update", entity_type="employee", entity_id=employee_id,
        before=before, after=_employee_out(employee).model_dump(mode="json"),
    )
    await db.commit()
    await db.refresh(employee)
    return _employee_out(employee)


@router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_employee(employee_id: int, db: DbSession, user: AdminUser) -> None:
    employee = await master_data.get_or_404(db, Employee, employee_id)
    await master_data.soft_delete(employee)
    await record_audit(
        db, actor_user_id=user.id, action="deactivate", entity_type="employee", entity_id=employee_id
    )
    await db.commit()


@router.post("/import", response_model=ImportEnqueuedOut, status_code=status.HTTP_202_ACCEPTED)
async def import_employees_excel(
    db: DbSession,
    user: AdminUser,
    queue: Annotated[ArqRedis, Depends(get_queue)],
    file: UploadFile,
) -> ImportEnqueuedOut:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    dest_path = UPLOAD_DIR / f"{uuid.uuid4().hex}_{file.filename}"
    content = await file.read()
    dest_path.write_bytes(content)

    batch = ImportBatch(
        type="employees",
        filename=file.filename or dest_path.name,
        storage_path=str(dest_path),
        status=ImportBatchStatus.queued,
        created_by=user.id,
    )
    db.add(batch)
    await db.flush()

    job = Job(
        type="import_employees",
        status=JobStatus.queued,
        params_json={"import_batch_id": batch.id},
        created_by=user.id,
    )
    db.add(job)
    await db.flush()
    await db.commit()
    await db.refresh(batch)
    await db.refresh(job)

    arq_job = await queue.enqueue_job("import_employees_task", job.id, batch.id)
    if arq_job is not None:
        job.arq_job_id = arq_job.job_id
        await db.commit()

    return ImportEnqueuedOut(job_id=job.id, batch_id=batch.id)


@router.get("/import/{batch_id}", response_model=ImportBatchOut)
async def get_import_batch(batch_id: int, db: DbSession, _user: AdminUser) -> ImportBatchOut:
    batch = await master_data.get_or_404(db, ImportBatch, batch_id)
    return _batch_out(batch)
