"""Domain tools the chat orchestrator may call.

Every tool is bound to (event, user) from the authenticated session — the LLM
never gets to pass another employee's id. Results are JSON-serialisable dicts
the model can quote; citations are attached by the executor, not the LLM.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.models.auth import User
from app.models.enums import UserRole
from app.models.event import Event, PickupPoint, Shift, TransportLeg
from app.models.gala import GalaConfig, GalaSeat, GalaTable, GalaTurn
from app.models.organization import Employee
from app.models.registration import Registration, RegistrationTransportNeed
from app.services.gala.gala_service import compute_team_quota
from app.services.journey_service import PUBLISHED_STATUSES, build_journey
from app.services.rag.hybrid import hybrid_search
from app.services.team_roster_service import build_team_roster, resolve_roster_team_id

logger = logging.getLogger("app")

OPENAI_TOOLS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "get_event_context",
            "description": (
                "Trạng thái sự kiện, hạn đăng ký, đã công bố hành trình chưa, "
                "trạng thái Gala. Dùng khi hỏi hạn, bước tiếp theo, hoặc sự kiện đang ở đâu."
            ),
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_my_registration",
            "description": (
                "Đăng ký của CBNV đang hỏi: đã nộp chưa, có tham gia không, ca nguyện vọng, "
                "nhu cầu xe 4 chặng và điểm đón."
            ),
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_my_journey",
            "description": (
                "Hành trình đã công bố của CBNV đang hỏi: chuyến bay, xe, phòng, Gala, lịch. "
                "Nếu BTC chưa công bố, tool trả published=false — không được bịa số liệu."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "section": {
                        "type": "string",
                        "enum": ["all", "flights", "buses", "room", "gala", "schedule"],
                        "description": "Phần hành trình cần lấy. Mặc định all.",
                    }
                },
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_gala_my_team",
            "description": (
                "Lượt Gala, quota, ghế team của CBNV đang hỏi đã chọn. "
                "Không đặt/huỷ ghế — chỉ thông tin và hướng dẫn sang trang Gala."
            ),
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_event_knowledge",
            "description": (
                "Tìm trong quy định, thông báo đã đăng, lịch trình, FAQ BTC soạn. "
                "Dùng cho câu hỏi chính sách, dress code, phạt hủy, lịch ngày X — "
                "không dùng cho 'xe/phòng/bay của tôi'."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Câu hỏi độc lập, đủ nghĩa, tiếng Việt.",
                    }
                },
                "required": ["query"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_my_team_roster",
            "description": (
                "Danh sách Team của trưởng nhóm đang hỏi: ai đã/chưa đăng ký, ca nguyện vọng. "
                "Chỉ trưởng nhóm hoặc BTC. CBNV thường không dùng được."
            ),
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
    },
]


@dataclass
class ToolContext:
    db: AsyncSession
    event: Event
    user: User


def _citation(title: str, source_type: str, href: str | None = None) -> dict:
    item = {"title": title, "source_type": source_type}
    if href:
        item["href"] = href
    return item


async def _employee(ctx: ToolContext) -> Employee | None:
    if ctx.user.employee_id is None:
        return None
    if ctx.user.employee is not None:
        return ctx.user.employee
    return await ctx.db.get(Employee, ctx.user.employee_id)


async def get_event_context(ctx: ToolContext) -> tuple[dict, list[dict]]:
    event = ctx.event
    gala_status = None
    result = await ctx.db.execute(select(GalaConfig).where(GalaConfig.event_id == event.id))
    config = result.scalar_one_or_none()
    if config is not None:
        gala_status = config.status
    published = event.status.value in PUBLISHED_STATUSES
    payload = {
        "event_id": event.id,
        "event_name": event.name,
        "description": event.description,
        "destination": event.destination,
        "start_date": event.start_date.isoformat() if event.start_date else None,
        "end_date": event.end_date.isoformat() if event.end_date else None,
        "status": event.status.value,
        "registration_open_at": (
            event.registration_open_at.isoformat() if event.registration_open_at else None
        ),
        "registration_close_at": (
            event.registration_close_at.isoformat() if event.registration_close_at else None
        ),
        "information_published": published,
        "gala_status": gala_status,
        "next_step": _next_step(event.status.value, published),
    }
    return payload, [_citation("Thông tin sự kiện", "event", "/register")]


def _next_step(status: str, published: bool) -> str:
    if status == "registration_open":
        return "Hoàn tất đăng ký trên trang Đăng ký trước hạn đóng."
    if status in ("registration_closed", "allocation_processing"):
        return "BTC đang phân bổ. Hành trình (bay/xe/phòng) chưa xem được cho đến khi công bố."
    if published:
        return "Xem hành trình đã công bố trên trang Hành trình. Gala: vào trang Gala khi tới lượt team."
    return "Chờ BTC mở đăng ký hoặc công bố thông tin."


async def get_my_registration(ctx: ToolContext) -> tuple[dict, list[dict]]:
    employee = await _employee(ctx)
    if employee is None:
        return {"error": "Tài khoản không gắn CBNV"}, []
    result = await ctx.db.execute(
        select(Registration).where(
            Registration.event_id == ctx.event.id,
            Registration.employee_id == employee.id,
        )
    )
    reg = result.scalar_one_or_none()
    if reg is None:
        return {
            "has_registration": False,
            "message": "Bạn chưa có bản đăng ký cho sự kiện này.",
        }, [_citation("Đăng ký", "registration", "/register")]

    shift_name = None
    if reg.shift_id is not None:
        shift = await ctx.db.get(Shift, reg.shift_id)
        shift_name = shift.name if shift else None

    needs_rows = await ctx.db.execute(
        select(RegistrationTransportNeed, TransportLeg, PickupPoint)
        .join(TransportLeg, TransportLeg.id == RegistrationTransportNeed.leg_id)
        .outerjoin(PickupPoint, PickupPoint.id == RegistrationTransportNeed.pickup_point_id)
        .where(RegistrationTransportNeed.registration_id == reg.id)
        .order_by(TransportLeg.sort_order)
    )
    needs = []
    for need, leg, pickup in needs_rows.all():
        needs.append({
            "leg_name": leg.name,
            "direction": leg.direction,
            "is_needed": need.is_needed,
            "pickup_name": pickup.name if pickup else None,
            "pickup_address": pickup.address if pickup else None,
        })
    payload = {
        "has_registration": True,
        "status": reg.status,
        "is_participating": reg.is_participating,
        "shift_name": shift_name,
        "wish_note": reg.wish_note,
        "submitted_at": reg.submitted_at.isoformat() if reg.submitted_at else None,
        "transport_needs": needs,
        "can_edit": ctx.event.status.value == "registration_open",
    }
    return payload, [_citation("Đăng ký của bạn", "registration", "/register")]


async def get_my_journey(ctx: ToolContext, section: str = "all") -> tuple[dict, list[dict]]:
    employee = await _employee(ctx)
    if employee is None:
        return {"error": "Tài khoản không gắn CBNV"}, []
    if ctx.event.status.value not in PUBLISHED_STATUSES:
        return {
            "published": False,
            "event_status": ctx.event.status.value,
            "message": (
                "BTC chưa công bố hành trình. Chuyến bay, xe, phòng chưa xem được. "
                "Bạn vẫn hỏi được quy định, hạn đăng ký và nội dung đã nộp."
            ),
        }, [_citation("Hành trình (chưa công bố)", "journey", "/journey")]

    journey = await build_journey(ctx.db, ctx.event, employee)
    data = journey.model_dump(mode="json")
    if section and section != "all":
        keep = {
            "event_id", "event_name", "event_status", "full_name", "team_name", section,
        }
        data = {k: v for k, v in data.items() if k in keep}
    data["published"] = True
    if not data.get("flights"):
        data["flights_note"] = "Chưa được phân chuyến bay (hành trình đã công bố)."
    if not data.get("buses"):
        data["buses_note"] = "Chưa được phân xe (hành trình đã công bố)."
    if data.get("room") is None:
        data["room_note"] = "Chưa được phân phòng (hành trình đã công bố)."
    return data, [_citation("Hành trình của bạn", "journey", "/journey")]


async def get_gala_my_team(ctx: ToolContext) -> tuple[dict, list[dict]]:
    employee = await _employee(ctx)
    href = f"/gala/{ctx.event.id}"
    cites = [_citation("Gala Dinner", "gala", href)]
    if employee is None or employee.team_id is None:
        return {"has_team": False, "message": "Tài khoản chưa gắn Team."}, cites

    result = await ctx.db.execute(select(GalaConfig).where(GalaConfig.event_id == ctx.event.id))
    config = result.scalar_one_or_none()
    if config is None:
        return {"configured": False, "message": "Sự kiện chưa thiết lập Gala Dinner."}, cites

    result = await ctx.db.execute(
        select(GalaTurn).where(
            GalaTurn.event_id == ctx.event.id, GalaTurn.team_id == employee.team_id
        )
    )
    turn = result.scalar_one_or_none()
    quota = turn.seat_quota if turn else await compute_team_quota(
        ctx.db, ctx.event.id, employee.team_id, config
    )

    result = await ctx.db.execute(
        select(GalaSeat, GalaTable)
        .join(GalaTable, GalaTable.id == GalaSeat.table_id)
        .where(
            GalaTable.event_id == ctx.event.id,
            GalaSeat.team_id == employee.team_id,
            GalaSeat.status.in_(("held", "confirmed")),
        )
        .order_by(GalaTable.code, GalaSeat.seat_number)
    )
    seats = [
        {
            "table_code": table.code,
            "table_name": table.name,
            "seat_number": seat.seat_number,
            "label": seat.label,
            "status": seat.status,
        }
        for seat, table in result.all()
    ]
    payload = {
        "configured": True,
        "gala_name": config.name,
        "gala_status": config.status,
        "href": href,
        "turn": None if turn is None else {
            "order_no": turn.order_no,
            "status": turn.status,
            "seat_quota": turn.seat_quota,
            "started_at": turn.started_at.isoformat() if turn.started_at else None,
        },
        "seat_quota": quota,
        "seats": seats,
        "note": "Chat không đặt ghế hộ. Vào trang Gala khi tới lượt team.",
    }
    return payload, cites


async def search_event_knowledge(
    ctx: ToolContext, query: str, source_types: list[str] | None = None
) -> tuple[dict, list[dict]]:
    hits = await hybrid_search(
        ctx.db, query=query, event_id=ctx.event.id, source_types=source_types,
    )
    chunks = []
    citations: list[dict] = []
    for hit in hits:
        chunks.append({
            "id": hit["id"],
            "title": hit["title"],
            "source_type": hit["source_type"],
            "content": hit["content"],
            "score": hit["score"],
        })
        href = _knowledge_href(hit["source_type"], hit.get("source_id"), ctx.event.id)
        citations.append(_citation(hit["title"], hit["source_type"], href))
    return {"chunks": chunks, "count": len(chunks)}, citations


def _knowledge_href(source_type: str, source_id: str | None, event_id: int) -> str | None:
    if source_type == "announcement":
        return "/journey"
    if source_type == "schedule_item":
        return "/journey"
    if source_type == "terms":
        return "/register"
    if source_type == "event":
        return "/register"
    return None


async def get_my_team_roster(ctx: ToolContext) -> tuple[dict, list[dict]]:
    team_id = resolve_roster_team_id(ctx.user, None)
    roster = await build_team_roster(ctx.db, ctx.event.id, team_id)
    payload = roster.model_dump(mode="json")
    return payload, [_citation("Danh sách Team", "team", "/team")]


_HANDLERS = {
    "get_event_context": lambda ctx, args: get_event_context(ctx),
    "get_my_registration": lambda ctx, args: get_my_registration(ctx),
    "get_my_journey": lambda ctx, args: get_my_journey(ctx, args.get("section") or "all"),
    "get_gala_my_team": lambda ctx, args: get_gala_my_team(ctx),
    "search_event_knowledge": lambda ctx, args: search_event_knowledge(
        ctx, args.get("query") or "", args.get("source_types"),
    ),
    "get_my_team_roster": lambda ctx, args: get_my_team_roster(ctx),
}


async def execute_tool(ctx: ToolContext, name: str, arguments: dict[str, Any]) -> tuple[dict, list[dict]]:
    handler = _HANDLERS.get(name)
    if handler is None:
        return {"error": f"Unknown tool {name}"}, []
    # Leaders-only tool: CBNV hitting it must not leak a roster.
    if name == "get_my_team_roster" and ctx.user.role not in (
        UserRole.team_leader, UserRole.organizer, UserRole.super_admin,
    ):
        return {
            "error": "Bạn không xem được danh sách cả team. Chỉ trưởng nhóm được dùng tool này.",
            "code": "forbidden",
        }, []
    try:
        return await handler(ctx, arguments or {})
    except AppError as exc:
        return {"error": exc.message, "code": exc.code}, []
    except Exception:
        logger.exception("tool %s failed", name)
        return {"error": "Tool failed", "code": "tool_failed"}, []
