-- ════════════════════════════════════════════════════════════════════════
-- Crescent shared Supabase — RLS / security VERIFICATION  (READ-ONLY)
--
-- RLS is already defined by migrations 001–017. This script does NOT change
-- anything — every statement is a SELECT. Run it in the Supabase dashboard
-- (SQL Editor) for project jwslaqufrdoodsxasxnr and compare the output to the
-- "Expected" note under each query. Its purpose is to confirm the LIVE database
-- actually matches the migration files (migrations here are applied by hand, so
-- a skipped one would leave a gap that the repo can't reveal).
-- ════════════════════════════════════════════════════════════════════════

-- 1) Is RLS enabled on every table in `public`?
--    EXPECTED: rls_enabled = true for ALL rows. Any false row is a GAP.
select c.relname              as table_name,
       c.relrowsecurity       as rls_enabled,
       c.relforcerowsecurity  as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
order by c.relrowsecurity asc, c.relname;   -- any rls_enabled = false floats to the top

-- 2) Policies per table.
--    EXPECTED (as of migration 017):
--      inspector_profiles ...... 2  (select, update)
--      inspector_invites ....... 1  (select / admin)
--      inspection_reports ...... 4  (select, insert, update, delete)
--      report_photos ........... 3  (select, insert, delete)
--      bookings ................ 3  (select, update, delete)   [insert = service-role RPC only]
--      slot_blocks ............. 3  (select, insert, delete)
--      contact_messages ........ 1  (select / admin)           [insert = service-role only]
--      report_counters ......... 0  (deny-all by design)
--      rate_limits ............. 0  (deny-all by design)
select tablename, policyname, cmd, roles, permissive
from pg_policies
where schemaname = 'public'
order by tablename, cmd, policyname;

-- 3) Tables with RLS ON but ZERO policies (silent deny-all to anon/authenticated).
--    EXPECTED: exactly report_counters and rate_limits — both reached only via
--    SECURITY DEFINER functions. Any OTHER table here is an accidental lockout.
select c.relname as rls_on_but_no_policy
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  and not exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname
  )
order by 1;

-- 4) Direct table-level grants held by the public roles (anon / authenticated).
--    EXPECTED: no broad write grants on sensitive tables — access is meant to go
--    through RLS + SECURITY DEFINER RPCs. report_counters / rate_limits should
--    have NO grants for these roles. inspector_profiles UPDATE is column-scoped
--    (see query 5), so a table-wide UPDATE grant here would be a regression.
select table_name, grantee,
       string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
group by table_name, grantee
order by table_name, grantee;

-- 5) Column-level UPDATE grants on inspector_profiles (privilege-escalation guard,
--    migration 012). EXPECTED: authenticated may UPDATE only full_name, phone,
--    last_activity_at — and NOT role or status. If `role` or `status` appears
--    here for anon/authenticated, the inspector→admin escalation hole is OPEN.
select grantee, column_name, privilege_type
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'inspector_profiles'
  and grantee in ('anon', 'authenticated')
order by grantee, column_name;

-- 6) Storage bucket privacy. EXPECTED: report-photos → public = false (migration 013).
--    If public = true, every customer photo (plates/VINs/damage) is world-readable.
select id, name, public
from storage.buckets
where id = 'report-photos';

-- 7) Storage object policies for the report-photos bucket.
--    EXPECTED: owner-scoped select/insert/update/delete, all `to authenticated`
--    (no anon-readable policy). The render/PDF path bypasses these via service role.
select policyname, cmd, roles
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by cmd, policyname;

-- 8) Which migrations have actually run? Compare the list to the files in
--    supabase/migrations/ (001 … 017). A MISSING number = that migration never
--    ran on this DB — re-run it. If this query errors with "schema does not
--    exist", migrations were applied by hand (not `supabase db push`); in that
--    case rely on queries 1–7 to judge the live state.
select version, name
from supabase_migrations.schema_migrations
order by version;
