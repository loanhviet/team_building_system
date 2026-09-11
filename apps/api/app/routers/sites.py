from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.core.deps import CurrentUser, DbSession, require_admin
from app.models.auth import User
from app.models.organization import Site
from app.schemas.organization import SiteCreate, SiteOut, SiteUpdate
from app.services import master_data
from app.services.audit_service import record_audit

router = APIRouter(prefix="/sites", tags=["master-data"])

AdminUser = Annotated[User, Depends(require_admin)]


@router.get("", response_model=list[SiteOut])
async def list_sites(db: DbSession, _user: CurrentUser) -> list[Site]:
    return await master_data.list_all(db, Site)


@router.post("", response_model=SiteOut, status_code=status.HTTP_201_CREATED)
async def create_site(payload: SiteCreate, db: DbSession, user: AdminUser) -> Site:
    site = await master_data.create(db, Site, payload.model_dump())
    await record_audit(
        db,
        actor_user_id=user.id,
        action="create",
        entity_type="site",
        entity_id=site.id,
        after=payload.model_dump(),
    )
    await db.commit()
    await db.refresh(site)
    return site


@router.patch("/{site_id}", response_model=SiteOut)
async def update_site(site_id: int, payload: SiteUpdate, db: DbSession, user: AdminUser) -> Site:
    site = await master_data.get_or_404(db, Site, site_id)
    before = SiteOut.model_validate(site).model_dump()
    await master_data.update(db, site, payload.model_dump(exclude_unset=True))
    await record_audit(
        db,
        actor_user_id=user.id,
        action="update",
        entity_type="site",
        entity_id=site_id,
        before=before,
        after=SiteOut.model_validate(site).model_dump(),
    )
    await db.commit()
    await db.refresh(site)
    return site


@router.delete("/{site_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_site(site_id: int, db: DbSession, user: AdminUser) -> None:
    site = await master_data.get_or_404(db, Site, site_id)
    await master_data.soft_delete(site)
    await record_audit(
        db, actor_user_id=user.id, action="deactivate", entity_type="site", entity_id=site_id
    )
    await db.commit()
