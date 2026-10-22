from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.staff_auth import require_dev
from app.db.session import get_db
from app.models import Building, Device, FirmwareRelease, Flat, PendingScan, RfidTag, SyncState
from app.schemas.dev import DevBuilding, DevDevice, DevFirmwareRelease, DevPendingScan, Overview

# Developer console (website /staff/dev). Read-only by design: nothing here changes access,
# devices or firmware. The ESP32 endpoints (/device/*) are untouched.
router = APIRouter(prefix="/v2/dev", tags=["dev"], dependencies=[Depends(require_dev)])


def _active_versions(db: Session) -> dict[str, str]:
    rows = db.execute(select(FirmwareRelease.device_type, FirmwareRelease.version).where(FirmwareRelease.active.is_(True)))
    return {device_type: version for device_type, version in rows}


@router.get("/overview", response_model=Overview)
def overview(db: Session = Depends(get_db)):
    by_type = {
        (t or "unassigned"): n
        for t, n in db.execute(select(Device.device_type, func.count()).group_by(Device.device_type))
    }
    st = db.get(SyncState, 1)
    return Overview(
        buildings=db.scalar(select(func.count()).select_from(Building)) or 0,
        flats=db.scalar(select(func.count()).select_from(Flat)) or 0,
        flats_with_pin=db.scalar(select(func.count()).select_from(Flat).where(Flat.pin_hash.is_not(None))) or 0,
        flats_disabled=db.scalar(select(func.count()).select_from(Flat).where(Flat.access_enabled.is_(False))) or 0,
        tags=db.scalar(select(func.count()).select_from(RfidTag)) or 0,
        tags_enabled=db.scalar(select(func.count()).select_from(RfidTag).where(RfidTag.enabled.is_(True))) or 0,
        devices=by_type,
        devices_disabled=db.scalar(select(func.count()).select_from(Device).where(Device.enabled.is_(False))) or 0,
        pending_scans=db.scalar(select(func.count()).select_from(PendingScan)) or 0,
        sync_version=st.version if st else 0,
        sync_updated_at=st.updated_at if st else None,
    )


@router.get("/devices", response_model=list[DevDevice])
def devices(db: Session = Depends(get_db)):
    active = _active_versions(db)
    rows = db.execute(
        select(Device, Building.name).outerjoin(Building, Building.id == Device.building_id).order_by(Device.device_type, Device.device_id)
    ).all()
    result = []
    for dev, building_name in rows:
        target = active.get(dev.device_type or "")
        result.append(
            DevDevice(
                device_id=dev.device_id,
                device_type=dev.device_type,
                building_id=dev.building_id,
                building_name=building_name,
                enabled=dev.enabled,
                unlock_ms=dev.unlock_ms,
                fw_current_version=dev.fw_current_version,
                fw_active_version=target,
                # Same rule as /device/{id}/sync uses to offer an OTA.
                update_pending=bool(target and target != dev.fw_current_version),
            )
        )
    return result


@router.get("/firmware", response_model=list[DevFirmwareRelease])
def firmware(db: Session = Depends(get_db)):
    running = {
        (t, v): n
        for t, v, n in db.execute(
            select(Device.device_type, Device.fw_current_version, func.count()).group_by(Device.device_type, Device.fw_current_version)
        )
    }
    rows = db.execute(
        select(
            FirmwareRelease.id,
            FirmwareRelease.device_type,
            FirmwareRelease.version,
            FirmwareRelease.sha256,
            func.octet_length(FirmwareRelease.content),
            FirmwareRelease.active,
            FirmwareRelease.created_at,
        ).order_by(FirmwareRelease.created_at.desc())
    ).all()
    return [
        DevFirmwareRelease(
            id=r[0], device_type=r[1], version=r[2], sha256=r[3], size_bytes=r[4], active=r[5], created_at=r[6],
            devices_running=running.get((r[1], r[2]), 0),
        )
        for r in rows
    ]


@router.get("/buildings", response_model=list[DevBuilding])
def buildings(db: Session = Depends(get_db)):
    flats = dict(db.execute(select(Flat.building_id, func.count()).group_by(Flat.building_id)).all())
    devs = dict(db.execute(select(Device.building_id, func.count()).group_by(Device.building_id)).all())
    return [
        DevBuilding(id=b.id, name=b.name, elevator_pin_enabled=b.elevator_pin_enabled, flats=flats.get(b.id, 0), devices=devs.get(b.id, 0))
        for b in db.scalars(select(Building).order_by(Building.name))
    ]


@router.get("/scans", response_model=list[DevPendingScan])
def scans(db: Session = Depends(get_db)):
    rows = db.execute(
        select(PendingScan.id, PendingScan.device_id, PendingScan.last_seen_at, Flat.label)
        .outerjoin(RfidTag, RfidTag.hash == PendingScan.hash)
        .outerjoin(Flat, Flat.id == RfidTag.flat_id)
        .order_by(PendingScan.last_seen_at.desc())
        .limit(200)
    ).all()
    return [DevPendingScan(id=i, device_id=d, last_seen_at=seen, already_assigned_to=label) for i, d, seen, label in rows]
