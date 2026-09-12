from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.deps import DbSession, require_admin
from app.models.auth import User
from app.schemas.dashboard import DashboardOut
from app.services.dashboard_service import build_dashboard

router = APIRouter(prefix="/events/{event_id}", tags=["dashboard"])

AdminUser = Annotated[User, Depends(require_admin)]


@router.get("/dashboard", response_model=DashboardOut)
async def get_dashboard(event_id: int, db: DbSession, _user: AdminUser) -> DashboardOut:
    return await build_dashboard(db, event_id)
