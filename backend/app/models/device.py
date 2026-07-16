import datetime as dt
from sqlalchemy import DateTime, ForeignKey, Integer, String, func, Boolean, Float
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class Device(Base):
    __tablename__ = "devices"

    device_id: Mapped[str] = mapped_column(String, primary_key=True)
    secret: Mapped[str] = mapped_column(String, nullable=False)
    unlock_ms: Mapped[Integer] = mapped_column(Integer, nullable=False)

    device_type: Mapped[str] = mapped_column(String, nullable=True)  # "door" / "elevator"
    building_id: Mapped[int | None] = mapped_column(ForeignKey("buildings.id"), nullable=True, index=True)
    fw_current_version: Mapped[str] = mapped_column(String, nullable=True)  # reported by device each sync

    enabled: Mapped[bool] = mapped_column(Boolean, default=True)