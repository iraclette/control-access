import datetime as dt
from sqlalchemy import DateTime, Integer, String, func, Boolean, Float
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class Device(Base):
    __tablename__ = "devices"

    device_id: Mapped[str] = mapped_column(String, primary_key=True)
    secret: Mapped[str] = mapped_column(String, nullable=False)
    unlock_ms: Mapped[float] = mapped_column(Float, nullable=False)

    device_type: Mapped[str] = mapped_column(String, nullable=True)  # "door" / "elevator"
    fw_target_version: Mapped[str] = mapped_column(String, nullable=True)  # "1.0.3"
    fw_target_filename: Mapped[str] = mapped_column(String, nullable=True) # "door-v1.0.3.bin"
    fw_target_sha256: Mapped[str] = mapped_column(String, nullable=True)

    enabled: Mapped[bool] = mapped_column(Boolean, default=True)