from pydantic import BaseModel, Field


class FlatCreate(BaseModel):
    label: str = Field(min_length=1, max_length=64)


class FlatOut(BaseModel):
    id: int
    label: str
    name: str
    access_enabled: bool
    has_pin: bool

    class Config:
        from_attributes = True


class FlatPatch(BaseModel):
    access_enabled: bool


class SetPinIn(BaseModel):
    pin: str = Field(min_length=4, max_length=12)  # adjust as you like
