from typing import Annotated

from arq import ArqRedis
from fastapi import APIRouter, Depends, status

from app.core.deps import CurrentUser, DbSession, require_admin
from app.core.errors import AppError
from app.core.queue import get_queue
from app.core.time import utcnow
from app.models.auth import User
from app.models.event import Event, PickupPoint, Shift, TransportLeg
from app.models.organization import Site
from app.schemas.event import (
    PickupPointCreate,
    PickupPointOut,
    PickupPointUpdate,
    ShiftCreate,
    ShiftOut,
    ShiftUpdate,
    TransportLegCreate,
    TransportLegOut,
    TransportLegUpdate,
)
from app.services import master_data
from app.services.audit_service import record_audit
from app.services.notification.email_service import notify_employees, participating_employee_ids

router = APIRouter(prefix="/events/{event_id}", tags=["event-config"])

AdminUser = Annotated[User, Depends(require_admin)]


# --- Shifts ---------------------------------------------------------------


@router.get("/shifts", response_model=list[ShiftOut])
async def list_shifts(event_id: int, db: DbSession, _user: CurrentUser) -> list[Shift]:
    return await master_data.list_all(db, Shift, event_id=event_id, order_by=Shift.sort_order)


@router.post("/shifts", response_model=ShiftOut, status_code=status.HTTP_201_CREATED)
async def create_shift(
    event_id: int, payload: ShiftCreate, db: DbSession, user: AdminUser
) -> Shift:
    shift = await master_data.create(db, Shift, payload.model_dump(), event_id=event_id)
    await record_audit(
        db, actor_user_id=user.id, action="create", entity_type="shift", entity_id=shift.id,
        after=payload.model_dump(), event_id=event_id,
    )
    await db.commit()
    await db.refresh(shift)
    return shift


@router.patch("/shifts/{shift_id}", response_model=ShiftOut)
async def update_shift(
    event_id: int,
    shift_id: int,
    payload: ShiftUpdate,
    db: DbSession,
    user: AdminUser,
    queue: Annotated[ArqRedis, Depends(get_queue)],
) -> Shift:
    shift = await master_data.get_or_404(db, Shift, shift_id, event_id=event_id)
    before = ShiftOut.model_validate(shift).model_dump()
    await master_data.update(db, shift, payload.model_dump(exclude_unset=True))
    after = ShiftOut.model_validate(shift).model_dump()
    await record_audit(
        db, actor_user_id=user.id, action="update", entity_type="shift", entity_id=shift_id,
        before=before, after=after, event_id=event_id,
    )
    await db.commit()
    await db.refresh(shift)

    if before.get("depart_after_time") != after.get("depart_after_time"):
        employee_ids = await participating_employee_ids(db, event_id, shift_id=shift.id)
        old = before.get("depart_after_time") or "—"
        new = after.get("depart_after_time") or "—"
        if employee_ids:
            await notify_employees(
                db,
                queue,
                await master_data.get_or_404(db, Event, event_id),
                employee_ids,
                "flight_changed",
                dedupe_suffix=f"shift:{shift.id}:{utcnow().isoformat()}",
                extra_context={
                    "change_summary": f"Ca {shift.name}: giờ bay sau {old} đổi thành {new}.",
                },
            )
    return shift


@router.delete("/shifts/{shift_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_shift(event_id: int, shift_id: int, db: DbSession, user: AdminUser) -> None:
    shift = await master_data.get_or_404(db, Shift, shift_id, event_id=event_id)
    await master_data.soft_delete(shift)
    await record_audit(
        db, actor_user_id=user.id, action="deactivate", entity_type="shift", entity_id=shift_id,
        event_id=event_id,
    )
    await db.commit()


# --- Transport legs ---------------------------------------------------------


@router.get("/transport-legs", response_model=list[TransportLegOut])
async def list_transport_legs(event_id: int, db: DbSession, _user: CurrentUser) -> list[TransportLeg]:
    return await master_data.list_all(
        db, TransportLeg, event_id=event_id, order_by=TransportLeg.sort_order
    )


@router.post("/transport-legs", response_model=TransportLegOut, status_code=status.HTTP_201_CREATED)
async def create_transport_leg(
    event_id: int, payload: TransportLegCreate, db: DbSession, user: AdminUser
) -> TransportLeg:
    leg = await master_data.create(db, TransportLeg, payload.model_dump(), event_id=event_id)
    await record_audit(
        db, actor_user_id=user.id, action="create", entity_type="transport_leg", entity_id=leg.id,
        after=payload.model_dump(), event_id=event_id,
    )
    await db.commit()
    await db.refresh(leg)
    return leg


@router.patch("/transport-legs/{leg_id}", response_model=TransportLegOut)
async def update_transport_leg(
    event_id: int, leg_id: int, payload: TransportLegUpdate, db: DbSession, user: AdminUser
) -> TransportLeg:
    leg = await master_data.get_or_404(db, TransportLeg, leg_id, event_id=event_id)
    before = TransportLegOut.model_validate(leg).model_dump()
    await master_data.update(db, leg, payload.model_dump(exclude_unset=True))
    await record_audit(
        db, actor_user_id=user.id, action="update", entity_type="transport_leg", entity_id=leg_id,
        before=before, after=TransportLegOut.model_validate(leg).model_dump(), event_id=event_id,
    )
    await db.commit()
    await db.refresh(leg)
    return leg


@router.delete("/transport-legs/{leg_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_transport_leg(
    event_id: int, leg_id: int, db: DbSession, user: AdminUser
) -> None:
    leg = await master_data.get_or_404(db, TransportLeg, leg_id, event_id=event_id)
    await master_data.soft_delete(leg)
    await record_audit(
        db, actor_user_id=user.id, action="deactivate", entity_type="transport_leg",
        entity_id=leg_id, event_id=event_id,
    )
    await db.commit()


# --- Pickup points -----------------------------------------------------------


@router.get("/pickup-points", response_model=list[PickupPointOut])
async def list_pickup_points(event_id: int, db: DbSession, _user: CurrentUser) -> list[PickupPoint]:
    return await master_data.list_all(db, PickupPoint, event_id=event_id)


def _assert_pickup_kind(kind: str, site_id: int | None) -> None:
    if kind == "workplace" and site_id is None:
        raise AppError(
            "workplace_site_required",
            "Điểm nơi làm việc phải gắn địa điểm làm việc",
            status.HTTP_400_BAD_REQUEST,
        )


@router.post("/pickup-points", response_model=PickupPointOut, status_code=status.HTTP_201_CREATED)
async def create_pickup_point(
    event_id: int, payload: PickupPointCreate, db: DbSession, user: AdminUser
) -> PickupPoint:
    if payload.site_id is not None and await db.get(Site, payload.site_id) is None:
        raise AppError("invalid_site", "Địa điểm làm việc không tồn tại", status.HTTP_400_BAD_REQUEST)
    _assert_pickup_kind(payload.kind, payload.site_id)
    point = await master_data.create(db, PickupPoint, payload.model_dump(), event_id=event_id)
    await record_audit(
        db, actor_user_id=user.id, action="create", entity_type="pickup_point", entity_id=point.id,
        after=payload.model_dump(), event_id=event_id,
    )
    await db.commit()
    await db.refresh(point)
    return point


@router.patch("/pickup-points/{point_id}", response_model=PickupPointOut)
async def update_pickup_point(
    event_id: int, point_id: int, payload: PickupPointUpdate, db: DbSession, user: AdminUser
) -> PickupPoint:
    point = await master_data.get_or_404(db, PickupPoint, point_id, event_id=event_id)
    if payload.site_id is not None and await db.get(Site, payload.site_id) is None:
        raise AppError("invalid_site", "Địa điểm làm việc không tồn tại", status.HTTP_400_BAD_REQUEST)
    data = payload.model_dump(exclude_unset=True)
    _assert_pickup_kind(data.get("kind", point.kind), data.get("site_id", point.site_id))
    before = PickupPointOut.model_validate(point).model_dump()
    await master_data.update(db, point, data)
    await record_audit(
        db, actor_user_id=user.id, action="update", entity_type="pickup_point", entity_id=point_id,
        before=before, after=PickupPointOut.model_validate(point).model_dump(), event_id=event_id,
    )
    await db.commit()
    await db.refresh(point)
    return point


@router.delete("/pickup-points/{point_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_pickup_point(
    event_id: int, point_id: int, db: DbSession, user: AdminUser
) -> None:
    point = await master_data.get_or_404(db, PickupPoint, point_id, event_id=event_id)
    await master_data.soft_delete(point)
    await record_audit(
        db, actor_user_id=user.id, action="deactivate", entity_type="pickup_point",
        entity_id=point_id, event_id=event_id,
    )
    await db.commit()
