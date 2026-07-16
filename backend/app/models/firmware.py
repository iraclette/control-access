# app/models/firmware.py
from sqlalchemy import Column, Integer, String, DateTime, Boolean, UniqueConstraint
from sqlalchemy.sql import func
from .base import Base

class FirmwareRelease(Base):
    __tablename__ = "firmware_releases"
    __table_args__ = (UniqueConstraint("device_type", "version", name="uq_firmware_type_version"),)

    id = Column(Integer, primary_key=True)
    device_type = Column(String, nullable=False)  # "door" / "elevator"
    version = Column(String, nullable=False)  # "1.0.3"
    filename = Column(String, nullable=False)  # on-disk name under backend/firmware/
    sha256 = Column(String, nullable=False)
    active = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
