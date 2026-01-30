from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.db.session import get_db
from app.models import Flat, SyncState, Device
from app.schemas.sync import SyncSnapshot, SyncEntry

router = APIRouter(prefix="/device", tags=["device"])


@router.get("/{device_id}/sync", response_model=SyncSnapshot)
def sync(device_id: str, db: Session = Depends(get_db)):
    # For v1: allow unknown devices (or you can enforce registration)
    dev = db.scalar(select(Device).where(Device.device_id == device_id))
    if dev is None:
        # You can change to 401 if you want strict device registration
        dev = Device(device_id=device_id, secret="CHANGE_ME")  # placeholder
        db.add(dev)
        db.flush()

    st = db.get(SyncState, 1)
    if st is None:
        st = SyncState(id=1, version=0)
        db.add(st)
        db.flush()

    flats = db.scalars(select(Flat).where(Flat.pin_hash.is_not(None))).all()

    entries = [SyncEntry(pin_hash=f.pin_hash, access_enabled=f.access_enabled) for f in flats]

    db.commit()
    return SyncSnapshot(version=st.version, full=True, entries=entries)
