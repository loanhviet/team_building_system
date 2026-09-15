"""GET /api/employees leaked the whole staff directory to any logged-in role
before R1 (docs/REBUILD-PLAN.md §R1) — this pins the fix at the HTTP layer,
not just by reading the dependency in the router source."""


async def test_employee_list_forbidden_for_employee_role(client, world, auth_headers):
    resp = await client.get("/api/employees", headers=auth_headers(world.employee_user))
    assert resp.status_code == 403


async def test_employee_list_allowed_for_organizer(client, world, auth_headers):
    resp = await client.get("/api/employees", headers=auth_headers(world.organizer_user))
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] >= 1


async def test_employee_stats_forbidden_for_employee_role(client, world, auth_headers):
    resp = await client.get("/api/employees/stats", headers=auth_headers(world.employee_user))
    assert resp.status_code == 403


async def test_employee_stats_allowed_for_organizer(client, world, auth_headers):
    resp = await client.get("/api/employees/stats", headers=auth_headers(world.organizer_user))
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == body["active"] + body["inactive"]
