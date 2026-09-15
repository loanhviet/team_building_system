from datetime import datetime

from pydantic import BaseModel


class EmailTemplateOut(BaseModel):
    code: str
    subject: str
    body_html: str
    description: str | None
    is_custom: bool


class EmailTemplateUpdate(BaseModel):
    subject: str
    body_html: str


class EmailOutboxOut(BaseModel):
    id: int
    to_email: str
    template_code: str
    status: str
    attempts: int
    last_error: str | None
    created_at: datetime
    sent_at: datetime | None

    model_config = {"from_attributes": True}
