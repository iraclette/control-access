import datetime as dt
from pydantic import BaseModel, Field


class TagCreate(BaseModel):
    hash: str = Field(min_length=64, max_length=64)
    label: str | None = Field(default=None, max_length=64)


class TagOut(BaseModel):
    id: int
    flat_id: int
    hash: str
    label: str | None
    enabled: bool
    created_at: dt.datetime

    class Config:
        from_attributes = True


class TagPatch(BaseModel):
    enabled: bool | None = None
    label: str | None = None


class ScanIn(BaseModel):
    hash: str = Field(min_length=64, max_length=64)


class PendingScanOut(BaseModel):
    id: int
    hash: str
    device_id: str | None
    last_seen_at: dt.datetime
    created_at: dt.datetime

    class Config:
        from_attributes = True
