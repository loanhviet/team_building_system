from sqlalchemy import select

from app.core.security import verify_password
from app.models.auth import User
from app.models.notification import EmailOutbox
from app.models.organization import Employee
from app.services.importer.employee_import import _upsert_employee_and_user


async def test_imported_account_gets_random_password_by_welcome_email(db_session):
    outbox_id = await _upsert_employee_and_user(
        db_session,
        {
            "employee_code": "NV900",
            "full_name": "Nhan vien moi",
            "email": "new.employee@test.vn",
        },
    )
    await db_session.commit()

    assert outbox_id is not None
    outbox = await db_session.get(EmailOutbox, outbox_id)
    user = (
        await db_session.execute(select(User).where(User.email == "new.employee@test.vn"))
    ).scalar_one()
    temporary_password = outbox.payload_json["temporary_password"]
    assert temporary_password != "NV900"
    assert verify_password(temporary_password, user.password_hash)
    assert user.must_change_password is True


async def test_import_without_is_active_keeps_existing_employee_state(
    db_session, world
):
    world.employee.is_active = False
    await db_session.commit()

    outbox_id = await _upsert_employee_and_user(
        db_session,
        {
            "employee_code": world.employee.employee_code,
            "full_name": "Tên đã cập nhật",
            "email": world.employee.email,
        },
    )
    await db_session.commit()

    employee = await db_session.get(Employee, world.employee.id)
    assert outbox_id is None
    assert employee.full_name == "Tên đã cập nhật"
    assert employee.is_active is False
