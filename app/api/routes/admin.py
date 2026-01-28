from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.core.config import settings
from app.core.security import hash_pin
from app.db.session import get_db
from app.models import Flat, SyncState
from app.schemas.flat import FlatCreate, FlatOut, FlatPatch, SetPinIn

router = APIRouter(prefix="/admin", tags=["admin"])


def require_admin(x_admin_token: str | None = Header(default=None)):
    if x_admin_token != settings.ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")


def bump_version(db: Session) -> int:
    st = db.get(SyncState, 1)
    if st is None:
        st = SyncState(id=1, version=0)
        db.add(st)
        db.flush()
    st.version += 1
    db.flush()
    return st.version


@router.post("/flats", dependencies=[Depends(require_admin)], response_model=FlatOut)
def create_flat(payload: FlatCreate, db: Session = Depends(get_db)):
    existing = db.scalar(select(Flat).where(Flat.label == payload.label))
    if existing:
        raise HTTPException(status_code=409, detail="Flat label already exists")

    flat = Flat(label=payload.label, access_enabled=True)
    db.add(flat)
    db.commit()
    db.refresh(flat)

    return FlatOut(id=flat.id, label=flat.label, access_enabled=flat.access_enabled, has_pin=flat.pin_hash is not None)


@router.get("/flats", dependencies=[Depends(require_admin)], response_model=list[FlatOut])
def list_flats(db: Session = Depends(get_db)):
    flats = db.scalars(select(Flat).order_by(Flat.label.asc())).all()
    return [
        FlatOut(id=f.id, label=f.label, access_enabled=f.access_enabled, has_pin=f.pin_hash is not None)
        for f in flats
    ]


@router.patch("/flats/{flat_id}", dependencies=[Depends(require_admin)], response_model=FlatOut)
def patch_flat(flat_id: int, payload: FlatPatch, db: Session = Depends(get_db)):
    flat = db.get(Flat, flat_id)
    if not flat:
        raise HTTPException(status_code=404, detail="Flat not found")

    flat.access_enabled = payload.access_enabled
    bump_version(db)
    db.commit()
    db.refresh(flat)

    return FlatOut(id=flat.id, label=flat.label, access_enabled=flat.access_enabled, has_pin=flat.pin_hash is not None)


@router.put("/flats/{flat_id}/pin", dependencies=[Depends(require_admin)])
def set_flat_pin(flat_id: int, payload: SetPinIn, db: Session = Depends(get_db)):
    flat = db.get(Flat, flat_id)
    if not flat:
        raise HTTPException(status_code=404, detail="Flat not found")

    new_hash = hash_pin(payload.pin)

    # unique constraint might collide if two flats try same PIN; choose policy:
    # Here we forbid it (simple).
    other = db.scalar(select(Flat).where(Flat.pin_hash == new_hash, Flat.id != flat_id))
    if other:
        raise HTTPException(status_code=409, detail="PIN already in use")

    flat.pin_hash = new_hash
    bump_version(db)
    db.commit()

    return {"ok": True}
