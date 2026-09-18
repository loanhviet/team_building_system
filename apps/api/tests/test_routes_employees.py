from sqlalchemy import select

from app.models.auth import User


async def test_employee_update_keeps_linked_account_in_sync(
    client, world, auth_headers, db_session
):
    response = await client.patch(
        f"/api/employees/{world.employee.id}",
        headers=auth_headers(world.organizer_user),
        json={"email": "renamed@test.vn", "is_active": False},
    )
    assert response.status_code == 200
    assert response.json()["email"] == "renamed@test.vn"
    assert response.json()["is_active"] is False

    account = (
        await db_session.execute(
            select(User).where(User.employee_id == world.employee.id)
        )
    ).scalar_one()
    await db_session.refresh(account)
    assert account.email == "renamed@test.vn"
    assert account.is_active is False

    rejected = await client.get(
        "/api/auth/me", headers=auth_headers(world.employee_user)
    )
    assert rejected.status_code == 401


async def test_employee_deactivation_disables_linked_account(
    client, world, auth_headers, db_session
):
    response = await client.delete(
        f"/api/employees/{world.employee.id}",
        headers=auth_headers(world.organizer_user),
    )
    assert response.status_code == 204

    account = (
        await db_session.execute(
            select(User).where(User.employee_id == world.employee.id)
        )
    ).scalar_one()
    await db_session.refresh(account)
    assert account.is_active is False


async def test_employee_gender_can_be_updated(client, world, auth_headers):
    response = await client.patch(
        f"/api/employees/{world.employee.id}",
        headers=auth_headers(world.organizer_user),
        json={"gender": "female"},
    )
    assert response.status_code == 200
    assert response.json()["gender"] == "female"


async def test_employee_import_accepts_xlsx_only(client, world, auth_headers):
    response = await client.post(
        "/api/employees/import",
        headers=auth_headers(world.organizer_user),
        files={
            "file": (
                "legacy.xls",
                b"not-an-xlsx",
                "application/vnd.ms-excel",
            )
        },
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_file_type"

    broken = await client.post(
        "/api/employees/import",
        headers=auth_headers(world.organizer_user),
        files={
            "file": (
                "broken.xlsx",
                b"not-an-xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    assert broken.status_code == 400
    assert broken.json()["error"]["code"] == "invalid_xlsx"
