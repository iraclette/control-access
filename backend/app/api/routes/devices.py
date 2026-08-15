from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.core.config import settings
from app.db.session import get_db
from app.models import Device, Building
from app.schemas.firmware import DeviceOut, DeviceCreateIn, DeviceCreateOut, DevicePatchIn
from .admin import require_admin, bump_version

router = APIRouter(prefix="/admin/devices", tags=["admin-devices"])

DEVICE_TYPES = {"door", "elevator", "enroller"}


@router.post("", dependencies=[Depends(require_admin)], response_model=DeviceCreateOut)
def create_device(payload: DeviceCreateIn, db: Session = Depends(get_db)):
    if payload.device_type not in DEVICE_TYPES:
        raise HTTPException(status_code=422, detail=f"device_type must be one of {sorted(DEVICE_TYPES)}")

    if db.get(Device, payload.device_id):
        raise HTTPException(status_code=409, detail="Device already registered")

    if payload.building_id is not None and not db.get(Building, payload.building_id):
        raise HTTPException(status_code=404, detail="Building not found")

    # Firmware sends the shared DEVICE_SECRET (secrets.h) for /sync auth, not a
    # per-device one -- true per-device secrets would need a provisioning step
    # the firmware doesn't have, so this matches what's actually deployed.
    device = Device(
        device_id=payload.device_id,
        secret=settings.DEVICE_SECRET,
        unlock_ms=payload.unlock_ms,
        device_type=payload.device_type,
        building_id=payload.building_id,
        enabled=True,
    )
    db.add(device)
    db.commit()

    return DeviceCreateOut(device_id=device.device_id, secret=device.secret)


@router.get("", dependencies=[Depends(require_admin)], response_model=list[DeviceOut])
def list_devices(db: Session = Depends(get_db)):
    return db.scalars(select(Device).order_by(Device.device_id.asc())).all()


@router.patch("/{device_id}", dependencies=[Depends(require_admin)], response_model=DeviceOut)
def patch_device(device_id: str, payload: DevicePatchIn, db: Session = Depends(get_db)):
    device = db.get(Device, device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    if payload.device_type is not None:
        if payload.device_type not in DEVICE_TYPES:
            raise HTTPException(status_code=422, detail=f"device_type must be one of {sorted(DEVICE_TYPES)}")
        device.device_type = payload.device_type

    if payload.building_id is not None:
        if not db.get(Building, payload.building_id):
            raise HTTPException(status_code=404, detail="Building not found")
        device.building_id = payload.building_id

    if payload.unlock_ms is not None:
        device.unlock_ms = payload.unlock_ms

    if payload.enabled is not None:
        device.enabled = payload.enabled

    bump_version(db)
    db.commit()
    db.refresh(device)
    return device
