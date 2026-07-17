# app/models/pending_scan.py
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from .base import Base


class PendingScan(Base):
    __tablename__ = "pending_scans"

    id = Column(Integer, primary_key=True)
    hash = Column(String, unique=True, nullable=False)
    device_id = Column(String, ForeignKey("devices.device_id"), nullable=True)
    last_seen_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())
