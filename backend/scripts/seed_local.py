"""Fills a LOCAL database with fake access-control data shaped like the real building:
2 doors, 2 elevators, the enroller, firmware releases, flats with PINs and tags.

    cd backend
    DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \\
      PIN_SALT=local ADMIN_TOKEN=local DEVICE_SECRET=local-device-secret \\
      .venv/bin/python -m scripts.seed_local

Creates the tables with Alembic first (`alembic upgrade head`, same env). Refuses to run
against anything but localhost.
"""
import hashlib
import random
from urllib.parse import urlparse

from app.core.config import settings

if urlparse(settings.DATABASE_URL).hostname not in ("127.0.0.1", "localhost"):
    raise SystemExit(f"Refusing to seed {settings.DATABASE_URL}: local databases only.")

from sqlalchemy import delete  # noqa: E402

from app.core.security import hash_pin  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
from app.models import Building, Device, FirmwareRelease, Flat, PendingScan, RfidTag, SyncState  # noqa: E402

random.seed(22)
db = SessionLocal()
for model in (PendingScan, RfidTag, Device, FirmwareRelease, Flat, Building, SyncState):
    db.execute(delete(model))

building = Building(name="Gori Residence I", elevator_pin_enabled=True)
db.add(building)
db.flush()

for n in range(1, 154):  # 153 flats, like the real building
    flat = Flat(label=str(n), building_id=building.id, pin_hash=hash_pin(f"{100000 + n * 37:06d}"), access_enabled=n % 29 != 0)
    db.add(flat)
    db.flush()
    for _ in range(random.choice([0, 1, 2, 2, 3])):
        db.add(RfidTag(flat_id=flat.id, hash=hashlib.sha256(random.randbytes(8)).hexdigest(), enabled=random.random() > 0.05))

secret = settings.DEVICE_SECRET
db.add_all([
    Device(device_id="A1B2C3D4E5F6", secret=secret, unlock_ms=5000, device_type="door", building_id=building.id, enabled=True, fw_current_version="1.0.12"),
    Device(device_id="A1B2C3D4E5F7", secret=secret, unlock_ms=5000, device_type="door", building_id=building.id, enabled=True, fw_current_version="1.0.12"),
    Device(device_id="B1B2C3D4E5F1", secret=secret, unlock_ms=20000, device_type="elevator", building_id=building.id, enabled=True, fw_current_version="1.0.12"),
    Device(device_id="B1B2C3D4E5F2", secret=secret, unlock_ms=20000, device_type="elevator", building_id=building.id, enabled=True, fw_current_version="1.0.11"),
    Device(device_id="C1B2C3D4E5F1", secret=secret, unlock_ms=800, device_type="enroller", building_id=building.id, enabled=True, fw_current_version="1.0.0"),
])
for device_type in ("door", "elevator"):
    for version, active in (("1.0.10", False), ("1.0.11", False), ("1.0.12", True)):
        content = random.randbytes(963_536)
        db.add(FirmwareRelease(
            device_type=device_type, version=version, filename=f"{device_type}-{version}.bin",
            sha256=hashlib.sha256(content).hexdigest(), content=content, active=active,
        ))
db.add(PendingScan(hash=hashlib.sha256(b"new-tag").hexdigest(), device_id="C1B2C3D4E5F1"))
db.add(SyncState(id=1, version=412))
db.commit()
db.close()
print("seeded local access data: 1 building, 153 flats, 5 devices, 6 firmware releases")
