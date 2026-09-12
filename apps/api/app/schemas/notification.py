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
