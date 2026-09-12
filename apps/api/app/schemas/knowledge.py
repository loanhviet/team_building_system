from datetime import datetime

from pydantic import BaseModel, Field


class KnowledgeDocumentCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body_md: str = Field(min_length=1)
    is_published: bool = False


class KnowledgeDocumentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    body_md: str | None = None
    is_published: bool | None = None


class KnowledgeDocumentOut(BaseModel):
    id: int
    event_id: int
    title: str
    body_md: str
    is_published: bool
    updated_by: int | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
