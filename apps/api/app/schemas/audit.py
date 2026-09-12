from datetime import datetime

from pydantic import BaseModel


class AuditLogOut(BaseModel):
    id: int
    actor_user_id: int | None
    action: str
    entity_type: str
    entity_id: str
    before_json: dict | None
    after_json: dict | None
    reason: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
