import datetime as dt
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class Flat(Base):
    __tablename__ = "flats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    label: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(nullable=True)

    building_id: Mapped[int | None] = mapped_column(ForeignKey("buildings.id"), nullable=True, index=True)

    # one PIN per flat
    pin_hash: Mapped[str | None] = mapped_column(String(64), unique=True, index=True, nullable=True)

    access_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )