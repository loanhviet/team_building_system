async def test_forced_password_change_blocks_business_api(client, world, auth_headers, db_session):
    world.employee_user.must_change_password = True
    await db_session.commit()

    blocked = await client.get(
        f"/api/events/{world.event.id}/registrations/me", headers=auth_headers(world.employee_user)
    )
    assert blocked.status_code == 403
    assert blocked.json()["error"]["code"] == "password_change_required"

    allowed = await client.get("/api/auth/me", headers=auth_headers(world.employee_user))
    assert allowed.status_code == 200


async def test_change_password_keeps_current_browser_refresh_session(client, world):
    login = await client.post(
        "/api/auth/login", json={"email": world.employee_user.email, "password": "x"}
    )
    assert login.status_code == 200
    access_token = login.json()["access_token"]

    changed = await client.post(
        "/api/auth/change-password",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"current_password": "x", "new_password": "new-password"},
    )
    assert changed.status_code == 204

    refreshed = await client.post("/api/auth/refresh")
    assert refreshed.status_code == 200
    assert refreshed.json()["user"]["must_change_password"] is False
