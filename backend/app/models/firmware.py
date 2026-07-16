# app/models/firmware.py
from sqlalchemy import Column, Integer, String, DateTime, Boolean, LargeBinary, UniqueConstraint
from sqlalchemy.sql import func
from .base import Base

class FirmwareRelease(Base):
    __tablename__ = "firmware_releases"
    __table_args__ = (UniqueConstraint("device_type", "version", name="uq_firmware_type_version"),)

    id = Column(Integer, primary_key=True)
    device_type = Column(String, nullable=False)  # "door" / "elevator"
    version = Column(String, nullable=False)  # "1.0.3"
    filename = Column(String, nullable=False)  # served as /device/firmware/{filename}
    sha256 = Column(String, nullable=False)
    # Stored in the DB, not on disk -- Render's filesystem is ephemeral and gets
    # wiped on every redeploy, which silently orphaned uploaded binaries.
    content = Column(LargeBinary, nullable=True)
    active = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
