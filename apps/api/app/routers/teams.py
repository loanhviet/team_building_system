from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.core.deps import CurrentUser, DbSession, require_admin
from app.models.auth import User
from app.models.organization import Team
from app.schemas.organization import TeamCreate, TeamOut, TeamUpdate
from app.services import master_data
from app.services.audit_service import record_audit

router = APIRouter(prefix="/teams", tags=["master-data"])

AdminUser = Annotated[User, Depends(require_admin)]


@router.get("", response_model=list[TeamOut])
async def list_teams(db: DbSession, _user: CurrentUser) -> list[Team]:
    return await master_data.list_all(db, Team)


@router.post("", response_model=TeamOut, status_code=status.HTTP_201_CREATED)
async def create_team(payload: TeamCreate, db: DbSession, user: AdminUser) -> Team:
    team = await master_data.create(db, Team, payload.model_dump())
    await record_audit(
        db,
        actor_user_id=user.id,
        action="create",
        entity_type="team",
        entity_id=team.id,
        after=payload.model_dump(),
    )
    await db.commit()
    await db.refresh(team)
    return team


@router.patch("/{team_id}", response_model=TeamOut)
async def update_team(team_id: int, payload: TeamUpdate, db: DbSession, user: AdminUser) -> Team:
    team = await master_data.get_or_404(db, Team, team_id)
    before = TeamOut.model_validate(team).model_dump()
    await master_data.update(db, team, payload.model_dump(exclude_unset=True))
    await record_audit(
        db,
        actor_user_id=user.id,
        action="update",
        entity_type="team",
        entity_id=team_id,
        before=before,
        after=TeamOut.model_validate(team).model_dump(),
    )
    await db.commit()
    await db.refresh(team)
    return team


@router.delete("/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_team(team_id: int, db: DbSession, user: AdminUser) -> None:
    team = await master_data.get_or_404(db, Team, team_id)
    await master_data.soft_delete(team)
    await record_audit(
        db, actor_user_id=user.id, action="deactivate", entity_type="team", entity_id=team_id
    )
    await db.commit()
