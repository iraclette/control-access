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

## Deploying (not done yet)

The site will get its own Render service, separate from the access-control backend. The
production `site` schema migration is applied by hand after review.
