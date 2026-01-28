from pydantic import BaseModel


class SyncEntry(BaseModel):
    pin_hash: str
    access_enabled: bool


class SyncSnapshot(BaseModel):
    version: int
    full: bool = True
    entries: list[SyncEntry]
