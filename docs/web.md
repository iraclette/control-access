# Website (`apps/web`)

The public Developer22 website: projects, flats for sale, and interactive building views
where every flat is a clickable region on the facade. Next.js 16 + Tailwind 4 + Supabase,
same patterns as Shelby (unprefixed URLs, language in a cookie, `[lang]` routes).

## Run it locally

Needs Docker (for the local Supabase stack) and Node 20+.

```sh
# from the repo root: starts Postgres/Auth/Storage locally, applies supabase/migrations
# and loads supabase/seed.sql (demo data)
supabase start

cd apps/web
cp .env.example .env.local     # then fill the keys from `supabase status -o env`
npm install
npm run dev                    # http://localhost:3000
```

- Supabase Studio (browse/edit the local data): http://127.0.0.1:54323
- Reset the local database to migrations + seed: `supabase db reset`

## Demo data

`supabase/seed.sql` and the facade drawings in `apps/web/public/demo/` are generated
together by `apps/web/scripts/gen-demo.mjs`, so every polygon lines up with its drawing.
The project list is the company's real one (2 in Gori, Varketili, Gldanula); every flat,
price and drawing is fake. Regenerate with `node scripts/gen-demo.mjs`, then
`supabase db reset`. `NEXT_PUBLIC_DEMO=1` shows a "demo data" banner and keeps the site
out of search engines.

## Data model (`site` schema)

`supabase/migrations/20261022000001_site_schema.sql`.

- `projects` → `buildings` → `flats`; `views` (images of a building) and `hotspots`
  (one polygon per flat per view).
- Hotspot points are `[x, y]` pairs normalised to 0..1 of the image, so a re-upload at
  another resolution keeps every polygon in place.
- Prices: the shown price is always `price_per_m2_usd × area_m2`. The rate comes from the
  flat if staff set one, otherwise from the project. Totals are never stored.
- Translatable text is jsonb `{"ka", "en", "ru"}`; missing languages fall back to Georgian,
  then English.

## Security model

- Everything lives in the `site` schema, separate from the access-control tables in
  `public` (which have RLS on and no grants for the API roles).
- Visitors (anon key) can only **read published** projects and what belongs to them.
- Staff write through RLS (`site.is_staff()`, backed by `site.staff`).
- `site.leads` has no grants for browsers at all: the contact form posts to
  `/api/leads`, which validates, rate-limits and inserts with the service role.

## Interactive building views

`src/components/BuildingExplorer.tsx`: the image with an SVG overlay
(`viewBox="0 0 1 1"`, `preserveAspectRatio="none"`) holding one `<a><polygon/></a>` per
flat. Each polygon is a real link with a screen-reader label; keyboard Tab/Enter work; on
touch screens the first tap previews the flat and the second opens it. Sold flats are
hatched so status isn't shown by colour alone.

## Tests and CI

Three layers, all runnable locally and in CI (`.github/workflows/web.yml`):

| What | Where | Run locally |
|---|---|---|
| Unit tests: prices, filters, flat numbering, slugs, formatting, dictionary placeholders | `apps/web/src/lib/__tests__/` (Vitest) | `npm test` |
| Database security: RLS and grants checked as anon / signed-in non-staff / staff | `supabase/tests/` (pgTAP) | `supabase test db` (repo root) |
| Browser tests: public pages, building view, contact form, staff console, region editor, creating projects and flats | `apps/web/e2e/` (Playwright) | `npx playwright test` |

- Browser tests need the local Supabase running (`supabase start`) and reuse a running
  `npm run dev` (or start one). They create their own test accounts with random passwords,
  change demo data and put it back, and refuse to run against anything but a local Supabase.
- CI runs on every pull request touching `apps/web/` or `supabase/`, and on pushes to
  `platform-v2`: lint, typecheck, unit tests, then a fresh local Supabase in the runner
  (migrations + seed), pgTAP, a production build and the browser tests. No secrets are
  used and nothing touches production. On failure the Playwright report is uploaded.
- The firmware workflow (`firmware-release.yml`) is separate and still only runs on `main`.

## Deploying (not done yet)

The site will get its own Render service, separate from the access-control backend. The
production `site` schema migration is applied by hand after review.

## Staff console (`/staff`)

Staff sign in with a Supabase Auth account that has a row in `site.staff`
(role `staff`, or `dev` for the developer). Pages:

- **Overview**: new requests, flats by status per project.
- **Flats & prices**: per flat, tap Available/Reserved/Sold, set an own price per m² (empty =
  project price), hide from the site, edit number/floor/rooms/area, delete. Changes save
  immediately. The project's price per m² is edited at the top. Adding flats:
  - **Add a flat**: one at a time.
  - **Add flats floor by floor**: describe one floor's layout (rooms + area per flat) and a
    floor range; numbering continues in order (1, 2, 3…) or goes by floor (101, 102… 201…).
    Duplicate numbers are refused, and a building grows if flats go above its recorded height.
- **Projects**: create a project (starts unpublished with one building; its web address is
  generated from the name, Georgian and Russian transliterated), names and texts in
  ka/en/ru, status, completion date, price, cover image, published switch, buildings
  (add/rename/floors/delete), construction updates, delete project (removes everything
  under it).
- **Building images**: upload a render or photo per building and view type (front, side,
  floor plan…); images are resized in the browser before upload.
- **Region editor** (`/staff/views/<id>`): pick a flat, click the corners of its window area,
  click the first point (or Enter) to close. Drag points or the whole shape to adjust.
  "Paste last shape" copies the last region onto the selected flat and moves it by the
  measured floor spacing, so stacked floors take a click each.
- **Requests**: contact-form leads with call/email buttons, status, internal note.

Create accounts with the service role key (prints a generated password once):

```sh
cd apps/web
node --env-file=.env.local scripts/create-staff.mjs someone@example.com staff "Their name"
```

The console only decides what to show; RLS is the real gate. Verified locally: staff can
edit flats, read leads and upload images; a signed-in non-staff account changes nothing,
sees no leads and can't upload; nobody (staff included) can change roles through the API.
