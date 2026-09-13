import logging

from qdrant_client import AsyncQdrantClient, models

from app.core.config import get_settings

COLLECTION = "rag_chunks"

logger = logging.getLogger("app")

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


async def upsert_points(points: list[tuple[int, list[float], dict]]) -> None:
    """Batch upsert (id, vector, payload) triples in one round trip — avoids
    one Qdrant call per chunk during reindex."""
    if not points:
        return
    client = get_client()
    await client.upsert(
        collection_name=COLLECTION,
        points=[
            models.PointStruct(id=doc_id, vector=vector, payload=payload)
            for doc_id, vector, payload in points
        ],
    )


async def delete_documents(doc_ids: list[int]) -> None:
    if not doc_ids:
        return
    client = get_client()
    await client.delete(
        collection_name=COLLECTION, points_selector=models.PointIdsList(points=doc_ids)
    )


async def search_chunks(
    vector: list[float],
    event_id: int,
    limit: int = 8,
    source_types: list[str] | None = None,
) -> list[dict]:
    client = get_client()
    if not await client.collection_exists(COLLECTION):
        return []

    must: list[models.FieldCondition | models.Filter] = [
        models.FieldCondition(key="event_id", match=models.MatchValue(value=event_id)),
        models.FieldCondition(key="scope", match=models.MatchValue(value="public")),
    ]
    if source_types:
        must.append(
            models.Filter(
                should=[
                    models.FieldCondition(key="source_type", match=models.MatchValue(value=st))
                    for st in source_types
                ]
            )
        )
    result = await client.query_points(
        collection_name=COLLECTION,
        query=vector,
        query_filter=models.Filter(must=must),
        limit=limit,
    )
    return [{"id": p.id, "score": p.score, **(p.payload or {})} for p in result.points]
