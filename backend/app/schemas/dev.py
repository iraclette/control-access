import datetime as dt
from pydantic import BaseModel

# Read-only views for the developer console. Deliberately no secrets: no device secret,
# no PIN or tag hashes, no firmware binaries.


class Overview(BaseModel):
    buildings: int
    flats: int
    flats_with_pin: int
    flats_disabled: int
    tags: int
    tags_enabled: int
    devices: dict[str, int]   # by device_type ("door", "elevator", "enroller", "unassigned")
    devices_disabled: int
    pending_scans: int
    sync_version: int
    sync_updated_at: dt.datetime | None


class DevDevice(BaseModel):
    device_id: str
    device_type: str | None
    building_id: int | None
    building_name: str | None
    enabled: bool
    unlock_ms: int
    fw_current_version: str | None
    fw_active_version: str | None   # active release for its type
    update_pending: bool            # it will OTA on its next full sync


class DevFirmwareRelease(BaseModel):
    id: int
    device_type: str
    version: str
    sha256: str
    size_bytes: int | None
    active: bool
    created_at: dt.datetime | None
    devices_running: int


class DevBuilding(BaseModel):
    id: int
    name: str
    elevator_pin_enabled: bool
    flats: int
    devices: int


class DevPendingScan(BaseModel):
    id: int
    device_id: str | None
    already_assigned_to: str | None   # flat label if this tag is already registered
    last_seen_at: dt.datetime | None
