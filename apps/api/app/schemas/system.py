from datetime import datetime

from pydantic import BaseModel


class JobOut(BaseModel):
    id: int
    type: str
    status: str
    progress: int
    total: int | None
    result_json: dict | None
    error: str | None
    created_at: datetime
    finished_at: datetime | None
    event_id: int | None

    model_config = {"from_attributes": True}


class ImportBatchOut(BaseModel):
    id: int
    type: str
    filename: str
    status: str
    total_rows: int
    ok_rows: int
    error_rows: int
    errors_json: list | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ImportEnqueuedOut(BaseModel):
    job_id: int
    batch_id: int
