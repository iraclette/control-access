from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.db.session import get_db
from app.models import Flat, RfidTag, PendingScan
from app.schemas.tag import TagCreate, TagOut, TagPatch
from .admin import require_admin, bump_version

router = APIRouter(prefix="/admin/flats/{flat_id}/tags", tags=["admin-tags"])


@router.post("", dependencies=[Depends(require_admin)], response_model=TagOut)
def create_tag(flat_id: int, payload: TagCreate, db: Session = Depends(get_db)):
    if not db.get(Flat, flat_id):
        raise HTTPException(status_code=404, detail="Flat not found")

    existing = db.scalar(select(RfidTag).where(RfidTag.hash == payload.hash))
    if existing:
        raise HTTPException(status_code=409, detail="This tag is already registered")

    tag = RfidTag(flat_id=flat_id, hash=payload.hash, label=payload.label, enabled=True)
    db.add(tag)

    # Claiming a scan by assigning it clears it from the pending queue automatically.
    pending = db.scalar(select(PendingScan).where(PendingScan.hash == payload.hash))
    if pending:
        db.delete(pending)

    bump_version(db)
    db.commit()
    db.refresh(tag)
    return tag


@router.get("", dependencies=[Depends(require_admin)], response_model=list[TagOut])
def list_tags(flat_id: int, db: Session = Depends(get_db)):
    if not db.get(Flat, flat_id):
        raise HTTPException(status_code=404, detail="Flat not found")

    return db.scalars(select(RfidTag).where(RfidTag.flat_id == flat_id).order_by(RfidTag.created_at.asc())).all()


@router.patch("/{tag_id}", dependencies=[Depends(require_admin)], response_model=TagOut)
def patch_tag(flat_id: int, tag_id: int, payload: TagPatch, db: Session = Depends(get_db)):
    tag = db.get(RfidTag, tag_id)
    if not tag or tag.flat_id != flat_id:
        raise HTTPException(status_code=404, detail="Tag not found")

    if payload.enabled is not None:
        tag.enabled = payload.enabled
    if payload.label is not None:
        tag.label = payload.label

    bump_version(db)
    db.commit()
    db.refresh(tag)
    return tag


@router.delete("/{tag_id}", dependencies=[Depends(require_admin)])
def delete_tag(flat_id: int, tag_id: int, db: Session = Depends(get_db)):
    tag = db.get(RfidTag, tag_id)
    if not tag or tag.flat_id != flat_id:
        raise HTTPException(status_code=404, detail="Tag not found")

    db.delete(tag)
    bump_version(db)
    db.commit()
    return {"ok": True}
