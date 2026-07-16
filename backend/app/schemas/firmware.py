import datetime as dt
from pydantic import BaseModel


class FirmwareReleaseOut(BaseModel):
    id: int
    device_type: str
    version: str
    filename: str
    sha256: str
    active: bool
    created_at: dt.datetime

    class Config:
        from_attributes = True


class DeviceOut(BaseModel):
    device_id: str
    device_type: str | None
    building_id: int | None
    enabled: bool
    fw_current_version: str | None

    class Config:
        from_attributes = True


class DeviceCreateIn(BaseModel):
    device_id: str
    device_type: str
    building_id: int | None = None
    unlock_ms: int = 800


class DeviceCreateOut(BaseModel):
    device_id: str
    secret: str


class DevicePatchIn(BaseModel):
    device_type: str | None = None
    building_id: int | None = None
    unlock_ms: int | None = None
    enabled: bool | None = None
