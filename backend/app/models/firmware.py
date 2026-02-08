# app/models/firmware.py
from sqlalchemy import Column, Integer, String, DateTime, Boolean
from sqlalchemy.sql import func
from .base import Base

class FirmwareRelease(Base):
    __tablename__ = "firmware_releases"

    id = Column(Integer, primary_key=True)
    version = Column(Integer, unique=True, nullable=False)
    url = Column(String, nullable=False)
    sha256 = Column(String, nullable=True)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
