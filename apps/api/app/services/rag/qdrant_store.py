from qdrant_client import AsyncQdrantClient, models

from app.core.config import get_settings

COLLECTION = "rag_documents"

_client: AsyncQdrantClient | None = None


def get_client() -> AsyncQdrantClient:
    global _client
    if _client is None:
        _client = AsyncQdrantClient(url=get_settings().qdrant_url)
    return _client


async def ensure_collection(dimension: int) -> None:
    client = get_client()
    if not await client.collection_exists(COLLECTION):
        await client.create_collection(
            collection_name=COLLECTION,
            vectors_config=models.VectorParams(size=dimension, distance=models.Distance.COSINE),
        )


async def upsert_document(doc_id: int, vector: list[float], payload: dict) -> None:
    client = get_client()
    await client.upsert(
        collection_name=COLLECTION,
        points=[models.PointStruct(id=doc_id, vector=vector, payload=payload)],
    )


async def delete_documents(doc_ids: list[int]) -> None:
    if not doc_ids:
        return
    client = get_client()
    await client.delete(
        collection_name=COLLECTION, points_selector=models.PointIdsList(points=doc_ids)
    )


async def search(
    vector: list[float], event_id: int, employee_id: int | None, limit: int = 5
) -> list[dict]:
    client = get_client()

    should: list[models.FieldCondition | models.Filter] = [
        models.FieldCondition(key="scope", match=models.MatchValue(value="public"))
    ]
    if employee_id is not None:
        should.append(
            models.Filter(
                must=[
                    models.FieldCondition(key="scope", match=models.MatchValue(value="employee")),
                    models.FieldCondition(
                        key="scope_ref_id", match=models.MatchValue(value=employee_id)
                    ),
                ]
            )
        )
    # A Filter with only `should` set (no must/must_not) requires at least one
    # should-condition to match — nesting it as a `must` entry below makes the
    # permission check mandatory, not just a scoring boost.
    permission_filter = models.Filter(should=should)

    query_filter = models.Filter(
        must=[
            models.FieldCondition(key="event_id", match=models.MatchValue(value=event_id)),
            permission_filter,
        ]
    )

    result = await client.query_points(
        collection_name=COLLECTION, query=vector, query_filter=query_filter, limit=limit
    )
    return [{"id": p.id, "score": p.score, **(p.payload or {})} for p in result.points]
