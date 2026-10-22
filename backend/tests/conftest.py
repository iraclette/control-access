"""Test setup: a throwaway Postgres database, created fresh for each run.

Points the app at it through environment variables *before* anything from `app` is
imported (settings and the engine are created at import time). Real env vars win over
backend/.env, so a production .env on disk is never used, and the guard below refuses
anything that isn't a local database.
"""
import os
import time
import uuid
from urllib.parse import urlparse

import jwt
import pytest
from sqlalchemy import create_engine, text

SERVER_URL = os.environ.get("TEST_DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres")
if urlparse(SERVER_URL).hostname not in ("127.0.0.1", "localhost"):
    raise RuntimeError(f"Refusing to run tests against {SERVER_URL}: tests drop and create databases.")

TEST_DB = "access_test"
TEST_URL = SERVER_URL.rsplit("/", 1)[0] + f"/{TEST_DB}"
JWT_SECRET = "test-jwt-secret-with-at-least-32-characters"

os.environ.update(
    DATABASE_URL=TEST_URL,
    PIN_SALT="test-pin-salt",
    ADMIN_TOKEN="test-admin-token",
    DEVICE_SECRET="test-device-secret",
    SUPABASE_JWT_SECRET=JWT_SECRET,
    SUPABASE_URL="http://supabase.test",
)

admin_engine = create_engine(SERVER_URL, isolation_level="AUTOCOMMIT")
with admin_engine.connect() as conn:
    conn.execute(text(f"drop database if exists {TEST_DB} with (force)"))
    conn.execute(text(f"create database {TEST_DB}"))
admin_engine.dispose()

from app.db.session import engine  # noqa: E402  (must come after the env setup above)
from app.main import app  # noqa: E402
from app.models import Base  # noqa: E402

Base.metadata.create_all(engine)
with engine.begin() as conn:
    # Stand-in for the website's site.staff table (same database in production).
    conn.execute(text("create schema site"))
    conn.execute(text("create table site.staff (user_id uuid primary key, role text not null)"))


@pytest.fixture(autouse=True)
def clean_db():
    yield
    tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
    with engine.begin() as conn:
        conn.execute(text(f"truncate {tables}, site.staff restart identity cascade"))


@pytest.fixture
def client():
    from fastapi.testclient import TestClient

    return TestClient(app)


def make_token(sub: str, *, secret: str = JWT_SECRET, aud: str = "authenticated", expires_in: int = 3600, **extra) -> str:
    now = int(time.time())
    return jwt.encode({"sub": sub, "aud": aud, "role": "authenticated", "iat": now, "exp": now + expires_in, **extra}, secret, algorithm="HS256")


@pytest.fixture
def staff_user():
    """Creates a site.staff row and returns (user_id, bearer header) for a role."""

    def create(role: str | None):
        user_id = str(uuid.uuid4())
        if role:
            with engine.begin() as conn:
                conn.execute(text("insert into site.staff (user_id, role) values (cast(:id as uuid), :role)"), {"id": user_id, "role": role})
        return user_id, {"Authorization": f"Bearer {make_token(user_id)}"}

    return create
