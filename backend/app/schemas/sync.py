from pydantic import BaseModel
from typing import List, Optional


class SyncEntry(BaseModel):
    pin_hash: str
    access_enabled: bool

class OTAMetadata(BaseModel):
    version: str
    url: str
    sha256: Optional[str] = None  # optional but recommended

class SyncSnapshot(BaseModel):
    version: int
    full: bool
    entries: List[SyncEntry]
    ota: Optional[OTAMetadata] = None