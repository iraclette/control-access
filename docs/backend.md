# Access backend (`backend/`)

FastAPI + SQLAlchemy + Alembic. Serves the ESP32 controllers (`/device/*`), the old admin UI
(`/admin-ui/*`, `/admin/*`) and, new in platform-v2, the read-only developer API (`/v2/dev/*`).
Production: Render service `control-access`, database = the Supabase project "Gori".

## Run it locally (never against production)

Needs the local Supabase from the repo root (`supabase start`). The backend's tables live in
the same database as the website's `site` schema, like in production.

```sh
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt -r requirements-dev.txt

# Local settings as environment variables: they win over backend/.env (which, in the main
# checkout, holds the PRODUCTION values; never run migrations with that file).
export DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
export PIN_SALT=local ADMIN_TOKEN=local-admin-token DEVICE_SECRET=local-device-secret
export SUPABASE_URL=http://127.0.0.1:54321

.venv/bin/alembic upgrade head          # creates the access tables
.venv/bin/python -m scripts.seed_local  # fake data shaped like the real building
.venv/bin/uvicorn app.main:app --port 8000
```

`supabase db reset` drops these tables; re-run the two commands above afterwards. The website
reaches the backend through `ACCESS_API_URL` (see `apps/web/.env.example`).

## Tests

```sh
.venv/bin/python -m pytest -q
```

They create a throwaway database (`access_test`) on the local Postgres (or `TEST_DATABASE_URL`)
and refuse to run against anything that isn't localhost.

- `tests/test_device_contract.py` pins the ESP32 contract: the exact keys of
  `/device/{id}/sync` and `/device/{id}/version`, key scoping per building, the elevator PIN
  toggle, OTA offers, auth failures. **If one fails, the change would affect doors already
  installed: ship it on a new endpoint instead.**
- `tests/test_dev_api.py`: who can use `/v2/dev` (only a valid Supabase token whose user has
  role `dev` in `site.staff`; bad, expired, forged, unsigned and wrong-audience tokens are
  refused; HS256 and ES256 projects both work) and that no secret ever appears in its output.

CI: `.github/workflows/backend.yml` (pytest against a Postgres container) and the browser job
in `web.yml`, which starts the backend for the developer console tests.

## Developer API (`/v2/dev/*`)

Read-only, for the website's `/staff/dev` page. Endpoints: `overview`, `devices`,
`firmware`, `buildings`, `scans`. Never returns the device secret, PIN or tag hashes, or
firmware binaries. Changing devices, keys or firmware stays in the old admin UI.

Auth: the website forwards the staff member's Supabase access token (via its `/api/dev/*`
relay). The backend verifies it against the project's public keys
(`SUPABASE_URL/auth/v1/.well-known/jwks.json`, ES256/RS256) or, for legacy projects, the
shared secret `SUPABASE_JWT_SECRET` (HS256), then checks `site.staff.role = 'dev'` in its own
database. Without either setting the endpoints answer 503, so deploying the code alone
changes nothing.

## Going live (later, needs your go-ahead)

1. Apply the Supabase migrations to Gori (`site` schema, and the `public` lockdown that stops
   new Alembic tables from getting API grants by default).
2. Set `SUPABASE_URL` (and `SUPABASE_JWT_SECRET` if Gori still uses HS256 keys) on the
   Render service, then deploy. `requirements.txt` gained PyJWT; nothing else changes for the
   ESP32 endpoints (pinned by the contract tests).
3. Create your account with role `dev` (`apps/web/scripts/create-staff.mjs`).
