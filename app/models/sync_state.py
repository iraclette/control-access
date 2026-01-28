import datetime as dt
from sqlalchemy import BigInteger, DateTime, Integer, func
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class SyncState(Base):
    """
    Single-row table. id=1.
    version increments whenever any access-relevant data changes (PIN/access_enabled).
    """
    __tablename__ = "sync_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)  # keep as 1
    version: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)

    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )