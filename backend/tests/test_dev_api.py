"""The developer console API (/v2/dev): who gets in, what it returns, and what it never returns."""
import json
import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec

from app.core import staff_auth
from app.core.config import settings
from app.main import app
from tests.conftest import make_token
from tests.factories import DEVICE_SECRET, TAG_HASH, seed_building

DEV_PATHS = sorted(r.path for r in app.routes if getattr(r, "path", "").startswith("/v2/dev"))


def test_all_dev_routes_are_listed():
    assert DEV_PATHS == ["/v2/dev/buildings", "/v2/dev/devices", "/v2/dev/firmware", "/v2/dev/overview", "/v2/dev/scans"]


# ---------- who gets in ----------

@pytest.mark.parametrize("path", DEV_PATHS)
def test_every_dev_route_needs_a_token(client, path):
    assert client.get(path).status_code == 401


@pytest.mark.parametrize(
    "token",
    [
        "not-a-jwt",
        make_token("00000000-0000-0000-0000-000000000000", secret="some-other-secret-that-is-long-enough"),
        make_token("00000000-0000-0000-0000-000000000000", expires_in=-60),
        make_token("00000000-0000-0000-0000-000000000000", aud="anon"),
        jwt.encode({"aud": "authenticated", "exp": int(time.time()) + 60}, "test-jwt-secret-with-at-least-32-characters", algorithm="HS256"),  # no sub
    ],
    ids=["garbage", "wrong-signature", "expired", "wrong-audience", "no-subject"],
)
def test_bad_tokens_are_rejected(client, token):
    assert client.get("/v2/dev/overview", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_unsigned_token_is_rejected(client):
    token = jwt.encode({"sub": "x", "aud": "authenticated"}, key=None, algorithm="none")
    assert client.get("/v2/dev/overview", headers={"Authorization": f"Bearer {token}"}).status_code == 401


@pytest.mark.parametrize("role", [None, "staff"])
def test_only_the_dev_role_gets_in(client, staff_user, role):
    _, headers = staff_user(role)
    assert client.get("/v2/dev/overview", headers=headers).status_code == 403


def test_dev_role_gets_in(client, staff_user):
    _, headers = staff_user("dev")
    assert client.get("/v2/dev/overview", headers=headers).status_code == 200


def test_not_configured_answers_503(client, staff_user, monkeypatch):
    _, headers = staff_user("dev")
    monkeypatch.setattr(settings, "SUPABASE_URL", None)
    monkeypatch.setattr(settings, "SUPABASE_JWT_SECRET", None)
    assert client.get("/v2/dev/overview", headers=headers).status_code == 503


def test_es256_tokens_are_verified_with_the_projects_public_key(client, staff_user, monkeypatch):
    user_id, _ = staff_user("dev")
    private_key = ec.generate_private_key(ec.SECP256R1())
    token = jwt.encode(
        {"sub": user_id, "aud": "authenticated", "exp": int(time.time()) + 60}, private_key, algorithm="ES256", headers={"kid": "k1"}
    )

    class FakeJwks:
        def get_signing_key_from_jwt(self, _token):
            return type("Key", (), {"key": private_key.public_key()})()

    monkeypatch.setattr(staff_auth, "_jwks_client", lambda: FakeJwks())
    assert client.get("/v2/dev/overview", headers={"Authorization": f"Bearer {token}"}).status_code == 200

    other_key = ec.generate_private_key(ec.SECP256R1())
    forged = jwt.encode({"sub": user_id, "aud": "authenticated", "exp": int(time.time()) + 60}, other_key, algorithm="ES256", headers={"kid": "k1"})
    assert client.get("/v2/dev/overview", headers={"Authorization": f"Bearer {forged}"}).status_code == 401


# ---------- what it returns ----------

@pytest.fixture
def dev(client, staff_user):
    seed_building()
    _, headers = staff_user("dev")
    return lambda path: client.get(path, headers=headers).json()


def test_overview_counts(dev):
    o = dev("/v2/dev/overview")
    assert (o["buildings"], o["flats"], o["flats_with_pin"], o["flats_disabled"]) == (1, 2, 2, 1)
    assert (o["tags"], o["tags_enabled"], o["pending_scans"], o["sync_version"]) == (2, 2, 2, 7)
    assert o["devices"] == {"door": 2, "elevator": 1}


def test_devices_show_firmware_and_pending_updates(dev):
    devices = {d["device_id"]: d for d in dev("/v2/dev/devices")}
    assert devices["DOOR1"]["update_pending"] is False
    assert devices["ELEV1"]["update_pending"] is True
    assert devices["ELEV1"]["fw_active_version"] == "1.0.12"
    assert devices["LOOSE"]["building_name"] is None
    assert devices["DOOR1"]["building_name"] == "Gori A"


def test_firmware_lists_releases_with_size_and_usage(dev):
    releases = {(r["device_type"], r["version"]): r for r in dev("/v2/dev/firmware")}
    assert releases[("door", "1.0.12")]["size_bytes"] == 1000
    assert releases[("door", "1.0.12")]["devices_running"] == 1
    assert releases[("door", "1.0.11")]["active"] is False


def test_buildings_and_scans(dev):
    assert dev("/v2/dev/buildings") == [{"id": 1, "name": "Gori A", "elevator_pin_enabled": True, "flats": 2, "devices": 2}]
    scans = dev("/v2/dev/scans")
    assert sorted(s["already_assigned_to"] or "-" for s in scans) == ["-", "1"]


def test_no_secrets_anywhere(dev):
    """Device secret, PIN/tag hashes and firmware binaries must never leave through /v2/dev."""
    from app.core.security import hash_pin

    everything = json.dumps([dev(path) for path in DEV_PATHS])
    for secret in [DEVICE_SECRET, TAG_HASH, hash_pin("123456"), hash_pin("654321"), "c" * 64]:
        assert secret not in everything
    for key in ['"secret"', '"pin_hash"', '"hash"', '"content"']:
        assert key not in everything
