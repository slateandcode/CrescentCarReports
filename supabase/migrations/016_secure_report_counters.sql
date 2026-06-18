-- ════════════════════════════════════════════════════════════════════════
-- 016 — Lock down report_counters + pin set_updated_at search_path
--
-- Two security/hardening gaps left by 001_init.sql:
--
-- 1) public.report_counters was created WITHOUT row level security (every other
--    table in the schema enables it). Supabase grants anon/authenticated full
--    table privileges on new public tables by default, and the anon key ships
--    to the browser — so anyone could read yearly report volume and, worse,
--    PATCH/POST/DELETE last_seq. Lowering last_seq to an already-issued value
--    makes the next next_report_reference() emit a duplicate CCR-YYYY-000N and
--    fail the UNIQUE constraint, breaking report creation for the whole team.
--    Enable RLS with NO policy (anon/authenticated then get zero rows) and
--    revoke the default grants. next_report_reference() and the delete RPC are
--    SECURITY DEFINER and bypass RLS, so report creation/deletion keep working.
--
-- 2) public.set_updated_at() was defined without a pinned search_path — the lone
--    exception to the schema's otherwise-consistent `set search_path = public`.
--    It is the Supabase `function_search_path_mutable` advisory item. Recreate
--    it with the pin; CREATE OR REPLACE preserves the existing triggers on
--    inspector_profiles, inspection_reports and bookings.
-- ════════════════════════════════════════════════════════════════════════

-- 1) report_counters: RLS on, no policy, default grants revoked.
alter table public.report_counters enable row level security;
revoke all on public.report_counters from anon, authenticated;

-- 2) set_updated_at: pin the search_path (clears the mutable-search_path advisory).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
