"""Contract of the endpoints the ESP32 controllers in the field depend on.

These tests pin today's behaviour of /device/{id}/sync and /device/{id}/version, including
the exact response keys the firmware parser reads. If one fails, a change would affect doors
already installed: don't "fix" the test, ship the change on a new endpoint instead.
"""
from tests.factories import DEVICE_SECRET, TAG_HASH, seed_building

HEADERS = {"X-Device-Secret": DEVICE_SECRET, "X-Firmware-Version": "1.0.12"}


def test_sync_response_shape(client):
    seed_building()
    body = client.get("/device/DOOR1/sync", headers=HEADERS).json()
    assert set(body) == {"version", "full", "entries", "tags", "ota", "device"}
    assert body["version"] == 7 and body["full"] is True
    assert body["device"] == {"unlock_ms": 5000}
    assert all(set(e) == {"pin_hash", "access_enabled"} for e in body["entries"])
    assert all(set(t) == {"hash", "access_enabled"} for t in body["tags"])


def test_sync_lists_building_keys_with_flat_status(client):
    seed_building()
    body = client.get("/device/DOOR1/sync", headers=HEADERS).json()
    assert sorted(e["access_enabled"] for e in body["entries"]) == [False, True]
    tags = {t["hash"]: t["access_enabled"] for t in body["tags"]}
    assert tags[TAG_HASH] is True
    assert tags["c" * 64] is False  # tag of a disabled flat


def test_sync_records_reported_firmware_and_offers_ota(client):
    seed_building()
    body = client.get("/device/ELEV1/sync", headers={**HEADERS, "X-Firmware-Version": "1.0.11"}).json()
    assert body["ota"]["version"] == "1.0.12"
    assert body["ota"]["sha256"] == "e" * 64
    assert body["ota"]["url"].endswith("/device/firmware/elevator-1.0.12.bin")
    # Up to date: no OTA.
    assert client.get("/device/DOOR1/sync", headers=HEADERS).json()["ota"] is None


def test_elevator_pin_toggle_keeps_tags(client):
    ids = seed_building()
    from app.db.session import SessionLocal
    from app.models import Building

    db = SessionLocal()
    db.get(Building, ids["building_id"]).elevator_pin_enabled = False
    db.commit()
    db.close()
    body = client.get("/device/ELEV1/sync", headers=HEADERS).json()
    assert body["entries"] == [] and len(body["tags"]) == 2
    assert len(client.get("/device/DOOR1/sync", headers=HEADERS).json()["entries"]) == 2


def test_unassigned_device_gets_no_keys(client):
    seed_building()
    body = client.get("/device/LOOSE/sync", headers=HEADERS).json()
    assert body["entries"] == [] and body["tags"] == []


def test_sync_rejects_bad_secret_and_unknown_device(client):
    seed_building()
    assert client.get("/device/DOOR1/sync", headers={"X-Device-Secret": "wrong"}).status_code == 401
    assert client.get("/device/NOPE/sync", headers=HEADERS).status_code == 401


def test_version_check(client):
    seed_building()
    assert client.get("/device/DOOR1/version", headers=HEADERS).json() == {"version": 7}
