import hashlib
from pathlib import Path

import semantic_version
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.db.session import get_db
from app.models import FirmwareRelease
from app.schemas.firmware import FirmwareReleaseOut
from .admin import require_admin

router = APIRouter(prefix="/admin/firmware", tags=["admin-firmware"])

FIRMWARE_DIR = Path(__file__).resolve().parents[3] / "firmware"
DEVICE_TYPES = {"door", "elevator"}


@router.post("/upload", dependencies=[Depends(require_admin)], response_model=FirmwareReleaseOut)
async def upload_firmware(
    device_type: str = Form(...),
    version: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    if device_type not in DEVICE_TYPES:
        raise HTTPException(status_code=422, detail=f"device_type must be one of {sorted(DEVICE_TYPES)}")

    try:
        semantic_version.Version(version)
    except ValueError:
        raise HTTPException(status_code=422, detail="version must be a valid semver string, e.g. 1.0.4")

    existing = db.scalar(
        select(FirmwareRelease).where(
            FirmwareRelease.device_type == device_type, FirmwareRelease.version == version
        )
    )
    if existing:
        raise HTTPException(status_code=409, detail="This device_type/version has already been uploaded")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=422, detail="Uploaded file is empty")

    sha256 = hashlib.sha256(content).hexdigest()
    filename = f"{device_type}-{version}.bin"

    FIRMWARE_DIR.mkdir(parents=True, exist_ok=True)
    (FIRMWARE_DIR / filename).write_bytes(content)

    release = FirmwareRelease(
        device_type=device_type,
        version=version,
        filename=filename,
        sha256=sha256,
        active=False,
    )
    db.add(release)
    db.commit()
    db.refresh(release)
    return release


@router.post("/{release_id}/activate", dependencies=[Depends(require_admin)], response_model=FirmwareReleaseOut)
def activate_firmware(release_id: int, db: Session = Depends(get_db)):
    release = db.get(FirmwareRelease, release_id)
    if not release:
        raise HTTPException(status_code=404, detail="Firmware release not found")

    db.query(FirmwareRelease).filter(
        FirmwareRelease.device_type == release.device_type,
        FirmwareRelease.id != release.id,
    ).update({"active": False})

    release.active = True
    db.commit()
    db.refresh(release)
    return release


@router.get("", dependencies=[Depends(require_admin)], response_model=list[FirmwareReleaseOut])
def list_firmware(db: Session = Depends(get_db)):
    return db.scalars(select(FirmwareRelease).order_by(FirmwareRelease.created_at.desc())).all()
