from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import select
from fastapi.responses import FileResponse
from pathlib import Path
import hashlib


from app.db.session import get_db
from app.models import Flat, SyncState, Device, FirmwareRelease
from app.schemas.sync import SyncSnapshot, SyncEntry, OTAMetadata

router = APIRouter(prefix="/device", tags=["device"])
FIRMWARE_DIR = Path(__file__).resolve().parents[3] / "firmware"


def require_device(db: Session, device_id: str, request: Request) -> Device:
    dev = db.scalar(select(Device).where(Device.device_id == device_id))
    if dev is None or not dev.enabled:
        raise HTTPException(status_code=401, detail="unknown device")

    got = request.headers.get("X-Device-Secret")
    if not got or got != dev.secret:
        raise HTTPException(status_code=401, detail="bad device secret")

    return dev


@router.get("/{device_id}/sync", response_model=SyncSnapshot)
def sync(device_id: str, request: Request, db: Session = Depends(get_db)):
    dev = require_device(db, device_id, request)

    reported_version = request.headers.get("X-Firmware-Version")
    if reported_version:
        dev.fw_current_version = reported_version

    st = db.get(SyncState, 1)
    if st is None:
        st = SyncState(id=1, version=0)
        db.add(st)
        db.flush()

    # A device with no building assigned gets no keys — fail closed rather than
    # leaking every building's PINs to an unassigned/misconfigured device.
    if dev.building_id is None:
        entries = []
    else:
        flats = db.scalars(
            select(Flat).where(Flat.pin_hash.is_not(None), Flat.building_id == dev.building_id)
        ).all()
        entries = [SyncEntry(pin_hash=f.pin_hash, access_enabled=f.access_enabled) for f in flats]

    ota = None
    if dev.device_type:
        release = db.scalar(
            select(FirmwareRelease).where(
                FirmwareRelease.device_type == dev.device_type,
                FirmwareRelease.active.is_(True),
            )
        )
        if release and release.version != dev.fw_current_version:
            base = str(request.base_url).rstrip("/")
            ota = OTAMetadata(
                version=release.version,
                url=f"{base}/device/firmware/{release.filename}",
                sha256=release.sha256,
            )

    db.commit()
    return SyncSnapshot(version=st.version, full=True, entries=entries, ota=ota, device={"unlock_ms": dev.unlock_ms})

@router.get("/firmware/{filename}")
def firmware_download(filename: str):
    # very basic path traversal protection
    if "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="invalid filename")

    fp = (FIRMWARE_DIR / filename).resolve()
    if not fp.exists() or not fp.is_file() or FIRMWARE_DIR not in fp.parents:
        raise HTTPException(status_code=404, detail="firmware not found")

    return FileResponse(
        path=str(fp),
        media_type="application/octet-stream",
        filename=fp.name,
    )
