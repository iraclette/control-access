from app.core.security import hash_pin
from app.db.session import SessionLocal
from app.models import Building, Device, FirmwareRelease, Flat, PendingScan, RfidTag, SyncState

DEVICE_SECRET = "test-device-secret"
TAG_HASH = "a" * 64
UNKNOWN_TAG_HASH = "b" * 64


def seed_building():
    """One building with two flats (one disabled), tags, devices and firmware releases."""
    db = SessionLocal()
    try:
        b = Building(name="Gori A", elevator_pin_enabled=True)
        db.add(b)
        db.flush()
        f1 = Flat(label="1", building_id=b.id, pin_hash=hash_pin("123456"), access_enabled=True)
        f2 = Flat(label="2", building_id=b.id, pin_hash=hash_pin("654321"), access_enabled=False)
        db.add_all([f1, f2])
        db.flush()
        db.add_all([
            RfidTag(flat_id=f1.id, hash=TAG_HASH, enabled=True),
            RfidTag(flat_id=f2.id, hash="c" * 64, enabled=True),
        ])
        db.add_all([
            Device(device_id="DOOR1", secret=DEVICE_SECRET, unlock_ms=5000, device_type="door", building_id=b.id, enabled=True, fw_current_version="1.0.12"),
            Device(device_id="ELEV1", secret=DEVICE_SECRET, unlock_ms=20000, device_type="elevator", building_id=b.id, enabled=True, fw_current_version="1.0.11"),
            Device(device_id="LOOSE", secret=DEVICE_SECRET, unlock_ms=800, device_type="door", building_id=None, enabled=True),
        ])
        db.add_all([
            FirmwareRelease(device_type="door", version="1.0.12", filename="door-1.0.12.bin", sha256="d" * 64, content=b"\x00" * 1000, active=True),
            FirmwareRelease(device_type="elevator", version="1.0.12", filename="elevator-1.0.12.bin", sha256="e" * 64, content=b"\x00" * 900, active=True),
            FirmwareRelease(device_type="door", version="1.0.11", filename="door-1.0.11.bin", sha256="f" * 64, content=b"\x00" * 800, active=False),
        ])
        db.add_all([PendingScan(hash=TAG_HASH, device_id="DOOR1"), PendingScan(hash=UNKNOWN_TAG_HASH, device_id="DOOR1")])
        db.add(SyncState(id=1, version=7))
        db.commit()
        return {"building_id": b.id}
    finally:
        db.close()
