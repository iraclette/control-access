from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.db.session import get_db
from app.models import Building
from app.schemas.building import BuildingCreate, BuildingOut, BuildingPatch
from .admin import require_admin, bump_version

router = APIRouter(prefix="/admin/buildings", tags=["admin-buildings"])


@router.post("", dependencies=[Depends(require_admin)], response_model=BuildingOut)
def create_building(payload: BuildingCreate, db: Session = Depends(get_db)):
    existing = db.scalar(select(Building).where(Building.name == payload.name))
    if existing:
        raise HTTPException(status_code=409, detail="Building name already exists")

    building = Building(name=payload.name)
    db.add(building)
    db.commit()
    db.refresh(building)
    return building


@router.get("", dependencies=[Depends(require_admin)], response_model=list[BuildingOut])
def list_buildings(db: Session = Depends(get_db)):
    return db.scalars(select(Building).order_by(Building.name.asc())).all()


@router.patch("/{building_id}", dependencies=[Depends(require_admin)], response_model=BuildingOut)
def patch_building(building_id: int, payload: BuildingPatch, db: Session = Depends(get_db)):
    building = db.get(Building, building_id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")

    building.elevator_pin_enabled = payload.elevator_pin_enabled
    bump_version(db)
    db.commit()
    db.refresh(building)
    return building
