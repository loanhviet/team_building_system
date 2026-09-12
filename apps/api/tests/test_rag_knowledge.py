from app.models.rag import KnowledgeDocument


async def test_employee_cannot_list_knowledge(client, world, auth_headers):
    resp = await client.get(
        f"/api/events/{world.event.id}/knowledge",
        headers=auth_headers(world.employee_user),
    )
    assert resp.status_code == 403


async def test_admin_crud_knowledge(client, world, auth_headers, db_session):
    headers = auth_headers(world.organizer_user)
    resp = await client.post(
        f"/api/events/{world.event.id}/knowledge",
        headers=headers,
        json={"title": "Dress code", "body_md": "Smart casual", "is_published": False},
    )
    assert resp.status_code == 201
    doc_id = resp.json()["id"]
    assert resp.json()["is_published"] is False

    resp = await client.patch(
        f"/api/events/{world.event.id}/knowledge/{doc_id}",
        headers=headers,
        json={"is_published": True},
    )
    assert resp.status_code == 200
    assert resp.json()["is_published"] is True

    listed = await client.get(f"/api/events/{world.event.id}/knowledge", headers=headers)
    assert listed.status_code == 200
    assert any(d["id"] == doc_id for d in listed.json())

    resp = await client.delete(
        f"/api/events/{world.event.id}/knowledge/{doc_id}", headers=headers
    )
    assert resp.status_code == 204
    remaining = (await db_session.execute(
        __import__("sqlalchemy").select(KnowledgeDocument).where(KnowledgeDocument.id == doc_id)
    )).scalar_one_or_none()
    assert remaining is None


async def test_reindex_enqueues_job(client, world, auth_headers):
    resp = await client.post(
        f"/api/events/{world.event.id}/rag/reindex",
        headers=auth_headers(world.organizer_user),
    )
    assert resp.status_code == 202
    assert resp.json()["job_id"]
    jobs = [name for name, *_ in client.fake_queue.jobs]
    assert "reindex_rag_task" in jobs
