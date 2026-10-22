-- Public website content (projects, flats for sale, interactive building views).
--
-- Lives in its own `site` schema so it never mixes with the access-control tables in
-- `public` (flats/devices/tags), which stay closed to the API roles (RLS on, no grants).
-- Visitors (anon) can only read published rows; staff write through RLS; leads are
-- written by the website's server with the service role, never directly by browsers.

create schema if not exists site;

create type site.project_status as enum ('planned', 'under_construction', 'completed');
create type site.flat_status as enum ('available', 'reserved', 'sold');
create type site.view_kind as enum ('front', 'back', 'side', 'aerial', 'floor_plan');
create type site.lead_status as enum ('new', 'contacted', 'closed');

-- Translatable text is stored as {"ka": "...", "en": "...", "ru": "..."}; the site falls
-- back to Georgian, then English, when a language is missing.

create table site.projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name jsonb not null,
  city jsonb not null default '{}',
  district jsonb not null default '{}',
  address jsonb not null default '{}',
  summary jsonb not null default '{}',
  description jsonb not null default '{}',
  status site.project_status not null default 'under_construction',
  completion_date date,                       -- actual, or expected while under construction
  price_per_m2_usd numeric(10, 2),            -- default rate for every flat in the project
  cover_image text,                           -- storage path or absolute URL
  sort_order int not null default 0,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table site.buildings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references site.projects (id) on delete cascade,
  name jsonb not null,
  floors int not null check (floors > 0),
  -- Later link to the access-control building (public.buildings.id). Never exposed publicly.
  access_building_id int,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table site.flats (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references site.buildings (id) on delete cascade,
  number text not null,
  floor int not null,
  rooms int not null check (rooms > 0),
  area_m2 numeric(7, 2) not null check (area_m2 > 0),
  -- Overrides the project's rate; the shown price is always rate × area, never stored.
  price_per_m2_usd numeric(10, 2),
  status site.flat_status not null default 'available',
  plan_image text,
  published boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (building_id, number)
);

create table site.views (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references site.buildings (id) on delete cascade,
  kind site.view_kind not null default 'front',
  label jsonb not null default '{}',
  image_path text not null,
  image_width int not null check (image_width > 0),
  image_height int not null check (image_height > 0),
  floor int,                                  -- only for floor plans
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- One clickable region per flat per view. Points are [x, y] pairs normalised to 0..1 of
-- the image, so a re-upload at another resolution keeps every polygon in place.
create table site.hotspots (
  id uuid primary key default gen_random_uuid(),
  view_id uuid not null references site.views (id) on delete cascade,
  flat_id uuid not null references site.flats (id) on delete cascade,
  points jsonb not null check (jsonb_typeof(points) = 'array' and jsonb_array_length(points) >= 3),
  unique (view_id, flat_id)
);

create table site.progress_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references site.projects (id) on delete cascade,
  happened_on date not null,
  title jsonb not null,
  body jsonb not null default '{}',
  image_path text,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table site.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  phone text,
  email text,
  message text,
  project_id uuid references site.projects (id) on delete set null,
  flat_id uuid references site.flats (id) on delete set null,
  locale text,
  status site.lead_status not null default 'new',
  staff_note text,
  check (phone is not null or email is not null)
);

-- Staff accounts (Supabase Auth users) and their role. `dev` is the developer console.
create table site.staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('dev', 'staff')),
  display_name text,
  created_at timestamptz not null default now()
);

create index on site.buildings (project_id);
create index on site.flats (building_id);
create index on site.flats (status);
create index on site.views (building_id);
create index on site.hotspots (flat_id);
create index on site.progress_updates (project_id, happened_on desc);
create index on site.leads (created_at desc);

create function site.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger projects_touch before update on site.projects
  for each row execute function site.touch_updated_at();
create trigger flats_touch before update on site.flats
  for each row execute function site.touch_updated_at();

-- security definer so RLS policies can call it without recursing into site.staff's own RLS.
create function site.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from site.staff where user_id = (select auth.uid()));
$$;

create function site.is_dev() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from site.staff where user_id = (select auth.uid()) and role = 'dev');
$$;

-- ---------- Grants: only what the policies below can use ----------

grant usage on schema site to anon, authenticated, service_role;
grant select on site.projects, site.buildings, site.flats, site.views, site.hotspots, site.progress_updates
  to anon, authenticated;
grant insert, update, delete on site.projects, site.buildings, site.flats, site.views, site.hotspots,
  site.progress_updates to authenticated;
grant select, update, delete on site.leads to authenticated;
grant select on site.staff to authenticated;
grant all on all tables in schema site to service_role;
grant execute on function site.is_staff(), site.is_dev() to anon, authenticated;

-- ---------- RLS ----------

alter table site.projects enable row level security;
alter table site.buildings enable row level security;
alter table site.flats enable row level security;
alter table site.views enable row level security;
alter table site.hotspots enable row level security;
alter table site.progress_updates enable row level security;
alter table site.leads enable row level security;
alter table site.staff enable row level security;

-- Visitors see published projects and what belongs to them; staff see everything.
create policy "read published projects" on site.projects for select
  using (published or (select site.is_staff()));

create policy "read buildings of published projects" on site.buildings for select
  using ((select site.is_staff()) or exists (
    select 1 from site.projects p where p.id = project_id and p.published));

create policy "read published flats" on site.flats for select
  using ((select site.is_staff()) or (published and exists (
    select 1 from site.buildings b join site.projects p on p.id = b.project_id
    where b.id = building_id and p.published)));

create policy "read views of published projects" on site.views for select
  using ((select site.is_staff()) or exists (
    select 1 from site.buildings b join site.projects p on p.id = b.project_id
    where b.id = building_id and p.published));

create policy "read hotspots of published flats" on site.hotspots for select
  using ((select site.is_staff()) or exists (
    select 1 from site.flats f join site.buildings b on b.id = f.building_id
    join site.projects p on p.id = b.project_id
    where f.id = flat_id and f.published and p.published));

create policy "read published progress" on site.progress_updates for select
  using ((select site.is_staff()) or (published and exists (
    select 1 from site.projects p where p.id = project_id and p.published)));

-- Staff writes (one policy per table, all commands except select which is above).
create policy "staff write projects" on site.projects for all to authenticated
  using ((select site.is_staff())) with check ((select site.is_staff()));
create policy "staff write buildings" on site.buildings for all to authenticated
  using ((select site.is_staff())) with check ((select site.is_staff()));
create policy "staff write flats" on site.flats for all to authenticated
  using ((select site.is_staff())) with check ((select site.is_staff()));
create policy "staff write views" on site.views for all to authenticated
  using ((select site.is_staff())) with check ((select site.is_staff()));
create policy "staff write hotspots" on site.hotspots for all to authenticated
  using ((select site.is_staff())) with check ((select site.is_staff()));
create policy "staff write progress" on site.progress_updates for all to authenticated
  using ((select site.is_staff())) with check ((select site.is_staff()));

-- Leads: staff only. Inserts come from the website server with the service role.
create policy "staff read leads" on site.leads for select to authenticated
  using ((select site.is_staff()));
create policy "staff update leads" on site.leads for update to authenticated
  using ((select site.is_staff())) with check ((select site.is_staff()));
create policy "staff delete leads" on site.leads for delete to authenticated
  using ((select site.is_staff()));

-- Staff list: each person sees their own row; devs see everyone. Changes go through the
-- service role (dev console) so nobody can promote themselves.
create policy "read own staff row" on site.staff for select to authenticated
  using (user_id = (select auth.uid()) or (select site.is_dev()));

-- ---------- Storage: public images for the website ----------

insert into storage.buckets (id, name, public)
values ('site', 'site', true)
on conflict (id) do nothing;

create policy "staff upload site images" on storage.objects for insert to authenticated
  with check (bucket_id = 'site' and (select site.is_staff()));
create policy "staff update site images" on storage.objects for update to authenticated
  using (bucket_id = 'site' and (select site.is_staff()));
create policy "staff delete site images" on storage.objects for delete to authenticated
  using (bucket_id = 'site' and (select site.is_staff()));
