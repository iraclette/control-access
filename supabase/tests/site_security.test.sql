-- Security rules of the website schema, checked as each kind of caller.
-- Run with `supabase test db` (pgTAP). Everything runs in one transaction and is rolled back.
begin;
select plan(21);

-- Two signed-in users: one staff member, one ordinary account (e.g. a future resident).
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'staff@test.local'),
  ('22222222-2222-4222-8222-222222222222', 'someone@test.local');
insert into site.staff (user_id, role) values ('11111111-1111-4111-8111-111111111111', 'staff');
insert into site.leads (name, phone) values ('Test lead', '+995555000000');

create function pg_temp.as_user(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- ---------- structure ----------

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'site' and c.relkind = 'r' and not c.relrowsecurity),
  0, 'every site table has RLS enabled');

-- The access-control tables live in public (prod) and must never be reachable by the API roles.
select is(
  (select count(*)::int from information_schema.role_table_grants
   where grantee in ('anon', 'authenticated') and table_schema = 'public'),
  0, 'API roles have no grants on any table in public');

-- ...including tables the backend's Alembic migrations create later.
create table public.probe_future_table (id int);
select is(
  (select count(*)::int from information_schema.role_table_grants
   where table_name = 'probe_future_table' and grantee in ('anon', 'authenticated')),
  0, 'new tables in public get no API grants by default');

-- ---------- anonymous visitor ----------

set local role anon;
select is((select count(*)::int from site.projects), 4, 'anon sees the 4 published projects');
select ok((select count(*) from site.flats) > 0, 'anon sees published flats');
select throws_ok('select * from site.leads', '42501', null, 'anon cannot read leads');
select throws_ok($$insert into site.leads (name, phone) values ('x', '1')$$, '42501', null, 'anon cannot write leads');
select throws_ok($$update site.flats set status = 'sold'$$, '42501', null, 'anon cannot change flats');
select throws_ok('select * from site.staff', '42501', null, 'anon cannot see the staff list');
reset role;

-- Unpublishing hides the project and everything under it.
update site.projects set published = false where slug = 'gldanula-residence';
update site.flats set published = false
  where id = (select f.id from site.flats f join site.buildings b on b.id = f.building_id
              join site.projects p on p.id = b.project_id where p.slug = 'gori-residence-1' limit 1);
set local role anon;
select is((select count(*)::int from site.projects), 3, 'unpublished project is hidden');
select is(
  (select count(*)::int from site.flats f join site.buildings b on b.id = f.building_id
   join site.projects p on p.id = b.project_id where p.slug = 'gldanula-residence'),
  0, 'flats of an unpublished project are hidden');
select is(
  (select count(*)::int from site.hotspots h join site.views v on v.id = h.view_id
   join site.buildings b on b.id = v.building_id join site.projects p on p.id = b.project_id
   where p.slug = 'gldanula-residence'),
  0, 'regions of an unpublished project are hidden');
select is(
  (select count(*)::int from site.flats where not published), 0, 'a hidden flat is not visible');
reset role;

-- ---------- signed in, not staff ----------

set local role authenticated;
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
with changed as (update site.flats set status = 'sold' returning 1)
select is((select count(*)::int from changed), 0, 'non-staff cannot change any flat');
select is((select count(*)::int from site.leads), 0, 'non-staff sees no leads');
select throws_ok(
  $$insert into site.staff (user_id, role) values ('22222222-2222-4222-8222-222222222222', 'dev')$$,
  '42501', null, 'non-staff cannot make themselves staff');
select is((select count(*)::int from site.projects), 3, 'non-staff sees only published projects');
reset role;

-- ---------- staff ----------

set local role authenticated;
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select is((select count(*)::int from site.projects), 4, 'staff also see unpublished projects');
with changed as (
  update site.flats set status = 'reserved'
  where number = '1' and building_id = (select b.id from site.buildings b join site.projects p on p.id = b.project_id
                                        where p.slug = 'gori-residence-2')
  returning 1)
select is((select count(*)::int from changed), 1, 'staff can change a flat');
select is((select count(*)::int from site.leads where name = 'Test lead'), 1, 'staff can read leads');
select throws_ok(
  $$update site.staff set role = 'dev' where user_id = '11111111-1111-4111-8111-111111111111'$$,
  '42501', null, 'staff cannot promote themselves');
reset role;

select * from finish();
rollback;
