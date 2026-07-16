import datetime as dt
from pydantic import BaseModel, Field


class BuildingCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)


class BuildingOut(BaseModel):
    id: int
    name: str
    elevator_pin_enabled: bool
    created_at: dt.datetime

    class Config:
        from_attributes = True


class BuildingPatch(BaseModel):
    elevator_pin_enabled: bool
