from typing import Annotated

from arq import ArqRedis
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession, require_admin
from app.core.errors import AppError
from app.core.queue import get_queue
from app.core.ws_manager import gala_manager, publish_gala_event
from app.models.auth import User
from app.models.enums import UserRole
from app.models.event import Event
from app.models.gala import GalaConfig, GalaSeat, GalaTable, GalaTurn
from app.models.organization import Employee, Team
from app.models.registration import Registration
from app.schemas.gala import (
    GalaConfigIn,
    GalaConfigOut,
    GalaSeatBlockIn,
    GalaSeatOut,
    GalaStateOut,
    GalaTableCreate,
    GalaTableOut,
    GalaTableUpdate,
    GalaTurnOut,
)
from app.services import master_data
from app.services.gala.gala_service import (
    auto_table_position,
    confirm_seat,
    draw_turns,
    hold_seat,
    release_seat,
    set_seat_blocked,
    skip_turn,
    start_turn,
)

router = APIRouter(prefix="/events/{event_id}/gala", tags=["gala"])

AdminUser = Annotated[User, Depends(require_admin)]


def _require_representative(user: User) -> User:
    if user.role not in (UserRole.team_leader, UserRole.organizer, UserRole.super_admin):
        raise AppError(
            "forbidden", "Chỉ Trưởng nhóm hoặc BTC được thao tác chọn ghế", status.HTTP_403_FORBIDDEN
        )
    return user


async def _get_or_create_config(db: DbSession, event_id: int) -> GalaConfig:
    result = await db.execute(select(GalaConfig).where(GalaConfig.event_id == event_id))
    config = result.scalar_one_or_none()
    if config is None:
        raise AppError("not_configured", "Chưa cấu hình Gala Dinner cho event này", status.HTTP_404_NOT_FOUND)
    return config


async def _my_team_id(db: DbSession, user: User) -> int:
    if user.employee_id is None:
        raise AppError(
            "no_employee_record", "Tài khoản này không gắn với hồ sơ nhân viên", status.HTTP_400_BAD_REQUEST
        )
    employee = await db.get(Employee, user.employee_id)
    if employee is None or employee.team_id is None:
        raise AppError("no_team", "Nhân viên chưa thuộc Team nào", status.HTTP_400_BAD_REQUEST)
    return employee.team_id


@router.get("/config", response_model=GalaConfigOut | None)
async def get_config(event_id: int, db: DbSession, _user: CurrentUser) -> GalaConfigOut | None:
    result = await db.execute(select(GalaConfig).where(GalaConfig.event_id == event_id))
    config = result.scalar_one_or_none()
    return GalaConfigOut.model_validate(config) if config else None


@router.put("/config", response_model=GalaConfigOut)
async def upsert_config(
    event_id: int, payload: GalaConfigIn, db: DbSession, _user: AdminUser
) -> GalaConfig:
    await master_data.get_or_404(db, Event, event_id)
    result = await db.execute(select(GalaConfig).where(GalaConfig.event_id == event_id))
    config = result.scalar_one_or_none()
    if config is None:
        config = GalaConfig(event_id=event_id, **payload.model_dump())
        db.add(config)
    else:
        for key, value in payload.model_dump().items():
            setattr(config, key, value)
    await db.commit()
    await db.refresh(config)
    return config


@router.get("/tables", response_model=list[GalaTableOut])
async def list_tables(event_id: int, db: DbSession, _user: CurrentUser) -> list[GalaTable]:
    return await master_data.list_all(db, GalaTable, event_id=event_id)


@router.post("/tables", response_model=GalaTableOut, status_code=status.HTTP_201_CREATED)
async def create_table(
    event_id: int, payload: GalaTableCreate, db: DbSession, _user: AdminUser
) -> GalaTable:
    data = payload.model_dump()
    if data.get("x") == 0 and data.get("y") == 0:
        existing = await master_data.list_all(db, GalaTable, event_id=event_id)
        data["x"], data["y"] = auto_table_position(len(existing))
    table = await master_data.create(db, GalaTable, data, event_id=event_id)
    await db.flush()
    for i in range(1, table.seat_count + 1):
        db.add(GalaSeat(table_id=table.id, seat_number=i, label=f"{table.code}-{i}"))
    await db.commit()
    await db.refresh(table)
    return table


@router.patch("/tables/{table_id}", response_model=GalaTableOut)
async def update_table(
    event_id: int,
    table_id: int,
    payload: GalaTableUpdate,
    db: DbSession,
    _user: AdminUser,
    queue: Annotated[ArqRedis, Depends(get_queue)],
) -> GalaTable:
    table = await master_data.get_or_404(db, GalaTable, table_id, event_id=event_id)
    await master_data.update(db, table, payload.model_dump(exclude_unset=True))
    await db.commit()
    await db.refresh(table)
    await publish_gala_event(
        queue,
        event_id,
        {"type": "table_update", "table_id": table.id, "x": table.x, "y": table.y},
    )
    return table


@router.post("/draw", response_model=list[GalaTurnOut])
async def draw(event_id: int, db: DbSession, _user: AdminUser) -> list[GalaTurnOut]:
    config = await _get_or_create_config(db, event_id)
    result = await db.execute(
        select(Employee.team_id)
        .join(Registration, Registration.employee_id == Employee.id)
        .where(
            Registration.event_id == event_id,
            Registration.status == "submitted",
            Registration.is_participating.is_(True),
            Employee.team_id.is_not(None),
        )
        .distinct()
    )
    team_ids = [row[0] for row in result.all()]
    if not team_ids:
        raise AppError("no_teams", "Không có Team nào để bốc thăm", status.HTTP_400_BAD_REQUEST)

    await draw_turns(db, event_id, config, team_ids)
    await db.commit()
    return await _turns_out(db, event_id)


@router.post("/turns/start", response_model=GalaTurnOut)
async def start_next_turn(
    event_id: int,
    db: DbSession,
    _user: AdminUser,
    queue: Annotated[ArqRedis, Depends(get_queue)],
) -> GalaTurnOut:
    config = await _get_or_create_config(db, event_id)
    turn = await start_turn(db, event_id, config)
    await db.commit()
    await publish_gala_event(
        queue,
        event_id,
        {
            "type": "turn_update",
            "team_id": turn.team_id,
            "expires_at": turn.expires_at.isoformat() if turn.expires_at else None,
            "finished": False,
        },
    )
    turns = await _turns_out(db, event_id)
    return next(t for t in turns if t.id == turn.id)


@router.post("/turns/skip", response_model=list[GalaTurnOut])
async def skip_current_turn(
    event_id: int,
    db: DbSession,
    _user: AdminUser,
    queue: Annotated[ArqRedis, Depends(get_queue)],
) -> list[GalaTurnOut]:
    config = await _get_or_create_config(db, event_id)
    await skip_turn(db, queue, event_id, config)
    await db.commit()
    return await _turns_out(db, event_id)


async def _turns_out(db: DbSession, event_id: int) -> list[GalaTurnOut]:
    result = await db.execute(
        select(GalaTurn, Team.name)
        .join(Team, Team.id == GalaTurn.team_id)
        .where(GalaTurn.event_id == event_id)
        .order_by(GalaTurn.order_no)
    )
    return [
        GalaTurnOut(
            id=t.id, team_id=t.team_id, team_name=name, order_no=t.order_no,
            seat_quota=t.seat_quota, status=t.status, started_at=t.started_at,
            expires_at=t.expires_at,
        )
        for t, name in result.all()
    ]


@router.get("/state", response_model=GalaStateOut)
async def get_state(event_id: int, db: DbSession, user: CurrentUser) -> GalaStateOut:
    result = await db.execute(select(GalaConfig).where(GalaConfig.event_id == event_id))
    config = result.scalar_one_or_none()

    tables = await master_data.list_all(db, GalaTable, event_id=event_id)
    seat_result = await db.execute(
        select(GalaSeat).join(GalaTable, GalaTable.id == GalaSeat.table_id).where(
            GalaTable.event_id == event_id
        )
    )
    seats = list(seat_result.scalars().all())
    turns = await _turns_out(db, event_id)

    my_team_id = None
    if user.employee_id is not None:
        employee = await db.get(Employee, user.employee_id)
        my_team_id = employee.team_id if employee else None

    return GalaStateOut(
        config=GalaConfigOut.model_validate(config) if config else None,
        tables=[GalaTableOut.model_validate(t) for t in tables],
        seats=[GalaSeatOut.model_validate(s) for s in seats],
        turns=turns,
        my_team_id=my_team_id,
    )


@router.post("/seats/{seat_id}/hold", response_model=GalaSeatOut)
async def hold(
    event_id: int,
    seat_id: int,
    db: DbSession,
    user: CurrentUser,
    queue: Annotated[ArqRedis, Depends(get_queue)],
) -> GalaSeat:
    _require_representative(user)
    team_id = await _my_team_id(db, user)
    config = await _get_or_create_config(db, event_id)
    seat = await hold_seat(db, queue, event_id, config, seat_id, team_id)
    await db.commit()
    return seat


@router.post("/seats/{seat_id}/confirm", response_model=GalaSeatOut)
async def confirm(
    event_id: int,
    seat_id: int,
    db: DbSession,
    user: CurrentUser,
    queue: Annotated[ArqRedis, Depends(get_queue)],
) -> GalaSeat:
    _require_representative(user)
    team_id = await _my_team_id(db, user)
    config = await _get_or_create_config(db, event_id)
    seat = await confirm_seat(db, queue, event_id, config, seat_id, team_id)
    await db.commit()
    return seat


@router.post("/seats/{seat_id}/block", response_model=GalaSeatOut)
async def block_seat(
    event_id: int,
    seat_id: int,
    payload: GalaSeatBlockIn,
    db: DbSession,
    _user: AdminUser,
    queue: Annotated[ArqRedis, Depends(get_queue)],
) -> GalaSeat:
    seat = await set_seat_blocked(db, queue, event_id, seat_id, payload.blocked)
    await db.commit()
    return seat


@router.post("/seats/{seat_id}/release", status_code=status.HTTP_204_NO_CONTENT)
async def release(
    event_id: int,
    seat_id: int,
    db: DbSession,
    user: CurrentUser,
    queue: Annotated[ArqRedis, Depends(get_queue)],
) -> None:
    _require_representative(user)
    team_id = await _my_team_id(db, user)
    await release_seat(db, queue, event_id, seat_id, team_id)
    await db.commit()


@router.websocket("/ws")
async def gala_ws(websocket: WebSocket, event_id: int) -> None:
    await gala_manager.connect(event_id, websocket)
    try:
        while True:
            # clients don't send anything meaningful; just keep the connection open
            await websocket.receive_text()
    except WebSocketDisconnect:
        gala_manager.disconnect(event_id, websocket)
