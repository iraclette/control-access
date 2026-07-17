from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.db.session import get_db
from app.models import PendingScan
from app.schemas.tag import PendingScanOut
from .admin import require_admin

router = APIRouter(prefix="/admin/scans", tags=["admin-scans"])


@router.get("", dependencies=[Depends(require_admin)], response_model=list[PendingScanOut])
def list_scans(db: Session = Depends(get_db)):
    return db.scalars(select(PendingScan).order_by(PendingScan.last_seen_at.desc())).all()


@router.delete("/{scan_id}", dependencies=[Depends(require_admin)])
def discard_scan(scan_id: int, db: Session = Depends(get_db)):
    scan = db.get(PendingScan, scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    db.delete(scan)
    db.commit()
    return {"ok": True}
