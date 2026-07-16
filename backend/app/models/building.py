# app/models/building.py
from sqlalchemy import Column, Integer, String, DateTime, Boolean
from sqlalchemy.sql import func
from .base import Base


class Building(Base):
    __tablename__ = "buildings"

    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, nullable=False)
    # PINs are short/guessable/shareable -- once a building has RFID chips issued,
    # this can be flipped off so elevator access requires a chip (individually
    # revocable) instead, without touching door access or any firmware.
    elevator_pin_enabled = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
