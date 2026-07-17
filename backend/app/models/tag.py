# app/models/tag.py
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.sql import func
from .base import Base


class RfidTag(Base):
    __tablename__ = "rfid_tags"

    id = Column(Integer, primary_key=True)
    flat_id = Column(Integer, ForeignKey("flats.id"), nullable=False, index=True)
    hash = Column(String, unique=True, nullable=False)
    label = Column(String, nullable=True)
    enabled = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
