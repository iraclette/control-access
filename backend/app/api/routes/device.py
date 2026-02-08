from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import select
from fastapi.responses import FileResponse
from pathlib import Path
import hashlib


from app.db.session import get_db
from app.models import Flat, SyncState, Device
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

    st = db.get(SyncState, 1)
    if st is None:
        st = SyncState(id=1, version=0)
        db.add(st)
        db.flush()

    flats = db.scalars(select(Flat).where(Flat.pin_hash.is_not(None))).all()
    entries = [SyncEntry(pin_hash=f.pin_hash, access_enabled=f.access_enabled) for f in flats]

    ota = None
    if dev.fw_target_version and dev.fw_target_filename:
        base = str(request.base_url).rstrip("/")
        ota = OTAMetadata(
        version=dev.fw_target_version,
        url=f"{base}/device/firmware/{dev.fw_target_filename}",
        sha256=dev.fw_target_sha256)

    db.commit()
    return SyncSnapshot(version=st.version, full=True, entries=entries, ota=ota)

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
