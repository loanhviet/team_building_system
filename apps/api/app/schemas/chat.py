from datetime import datetime

from pydantic import BaseModel


class ChatSessionCreate(BaseModel):
    event_id: int
    title: str | None = None


class ChatSessionOut(BaseModel):
    id: int
    event_id: int
    title: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatMessageCreate(BaseModel):
    content: str


class ChatMessageOut(BaseModel):
    id: int
    role: str
    content: str
    citations_json: list[dict] | None
    created_at: datetime

    model_config = {"from_attributes": True}
