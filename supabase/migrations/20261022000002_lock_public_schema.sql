-- The `public` schema holds the access-control tables (flats, PINs, RFID tags, devices,
-- firmware), created by the backend's Alembic migrations. The backend connects as `postgres`
-- and needs no API grants; the public API (anon/authenticated roles) must never reach them.
--
-- Supabase grants the API roles full access to every NEW table in `public` by default, so
-- revoking existing grants once (done by hand in production on 2026-10-22) isn't enough:
-- the next Alembic table would be exposed again. This removes those defaults and locks down
-- whatever already exists. Safe to run repeatedly.

alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- RLS with no policies as a second lock, for tables that exist now. (New Alembic tables get
-- no grants thanks to the defaults above; enable RLS on them in their own migration.)
do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end
$$;
