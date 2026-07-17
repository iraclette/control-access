import hmac

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import select
from fastapi.responses import Response


from app.core.config import settings
from app.db.session import get_db
from app.models import Flat, SyncState, Device, FirmwareRelease, Building, RfidTag
from app.schemas.sync import SyncSnapshot, SyncEntry, TagEntry, OTAMetadata

router = APIRouter(prefix="/device", tags=["device"])


def require_device(db: Session, device_id: str, request: Request) -> Device:
    dev = db.scalar(select(Device).where(Device.device_id == device_id))
    if dev is None or not dev.enabled:
        raise HTTPException(status_code=401, detail="unknown device")

    got = request.headers.get("X-Device-Secret")
    if not got or not hmac.compare_digest(got, dev.secret):
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
    building = db.get(Building, dev.building_id) if dev.building_id is not None else None

    # PINs are short/guessable/shareable -- once a building has RFID chips issued,
    # elevator_pin_enabled can be flipped off so guessing/reusing someone else's PIN
    # no longer grants elevator access, without touching door access or firmware.
    pin_access_blocked = (
        dev.device_type == "elevator" and building is not None and not building.elevator_pin_enabled
    )

    if building is None or pin_access_blocked:
        entries = []
    else:
        flats = db.scalars(
            select(Flat).where(Flat.pin_hash.is_not(None), Flat.building_id == dev.building_id)
        ).all()
        entries = [SyncEntry(pin_hash=f.pin_hash, access_enabled=f.access_enabled) for f in flats]

    # Tags are deliberately not gated by elevator_pin_enabled -- that toggle only
    # disables the guessable/shareable PIN, tags stay independent on every device.
    if building is None:
        tags = []
    else:
        tag_rows = db.execute(
            select(RfidTag, Flat.access_enabled)
            .join(Flat, RfidTag.flat_id == Flat.id)
            .where(Flat.building_id == dev.building_id)
        ).all()
        tags = [
            TagEntry(hash=tag.hash, access_enabled=tag.enabled and flat_enabled)
            for tag, flat_enabled in tag_rows
        ]

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
    return SyncSnapshot(
        version=st.version, full=True, entries=entries, tags=tags, ota=ota, device={"unlock_ms": dev.unlock_ms}
    )

@router.get("/firmware/{filename}")
def firmware_download(filename: str, request: Request, db: Session = Depends(get_db)):
    # Firmware binaries embed WIFI_PASSWORD/DEVICE_SECRET/PIN_SALT (baked in from
    # secrets.h at compile time) -- an unauthenticated download would let anyone
    # extract them from the .bin regardless of secrets.h being kept out of git.
    got = request.headers.get("X-Device-Secret")
    if not got or not hmac.compare_digest(got, settings.DEVICE_SECRET):
        raise HTTPException(status_code=401, detail="bad device secret")

    # Served from the DB, not disk -- Render's filesystem is ephemeral and gets
    # wiped on every redeploy, which used to silently orphan uploaded binaries.
    release = db.scalar(select(FirmwareRelease).where(FirmwareRelease.filename == filename))
    if not release or not release.content:
        raise HTTPException(status_code=404, detail="firmware not found")

    return Response(
        content=release.content,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
