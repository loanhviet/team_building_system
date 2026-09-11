from typing import Any

from fastapi import status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute

from app.core.errors import AppError


async def list_all[ModelT](
    db: AsyncSession,
    model: type[ModelT],
    *,
    event_id: int | None = None,
    order_by: InstrumentedAttribute | None = None,
) -> list[ModelT]:
    stmt = select(model)
    if event_id is not None:
        stmt = stmt.where(model.event_id == event_id)  # type: ignore[attr-defined]
    stmt = stmt.order_by(order_by if order_by is not None else model.id)  # type: ignore[attr-defined]
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_or_404[ModelT](
    db: AsyncSession, model: type[ModelT], entity_id: int, *, event_id: int | None = None
) -> ModelT:
    instance = await db.get(model, entity_id)
    if instance is None or (event_id is not None and instance.event_id != event_id):  # type: ignore[attr-defined]
        raise AppError("not_found", f"{model.__name__} not found", status.HTTP_404_NOT_FOUND)
    return instance


async def create[ModelT](
    db: AsyncSession, model: type[ModelT], data: dict[str, Any], *, event_id: int | None = None
) -> ModelT:
    payload = dict(data)
    if event_id is not None:
        payload["event_id"] = event_id
    instance = model(**payload)
    db.add(instance)
    try:
        await db.flush()
    except IntegrityError as exc:
        raise AppError(
            "conflict", "Dữ liệu bị trùng (mã/code đã tồn tại)", status.HTTP_409_CONFLICT
        ) from exc
    return instance


async def update[ModelT](db: AsyncSession, instance: ModelT, data: dict[str, Any]) -> ModelT:
    for key, value in data.items():
        if value is not None:
            setattr(instance, key, value)
    try:
        await db.flush()
    except IntegrityError as exc:
        raise AppError(
            "conflict", "Dữ liệu bị trùng (mã/code đã tồn tại)", status.HTTP_409_CONFLICT
        ) from exc
    return instance


async def soft_delete[ModelT](instance: ModelT) -> None:
    instance.is_active = False  # type: ignore[attr-defined]
