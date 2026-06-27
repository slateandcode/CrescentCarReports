-- ════════════════════════════════════════════════════════════════════════
-- 018 — Revoke anon EXECUTE on the internal report-sequence / delete RPCs
--
-- SECURITY HARDENING (low severity). A function created in the public schema is
-- granted EXECUTE to the PUBLIC pseudo-role by default, so `anon` (and every
-- role) can call it via PUBLIC even with no direct grant of its own. Both
-- functions below are SECURITY DEFINER, so an anon caller hitting
-- POST /rest/v1/rpc/<fn> runs them as the owner, bypassing RLS:
--
--   • next_report_reference()       — increments report_counters.last_seq and
--     returns the next CCR-YYYY-#### reference. An anonymous flood could inflate
--     the counter and open gaps in the report sequence. Legitimately called ONLY
--     by an authenticated inspector creating a report (app/(app)/reports/actions.ts
--     and app/(app)/bookings/actions.ts, via the cookie-bound client) — never anon.
--   • delete_report_renumber(uuid)  — already self-guards with is_admin() and
--     raises if the caller isn't an admin, so it is not exploitable, but anon has
--     no business being able to reach it at all.
--
-- IMPORTANT: anon's access comes from the PUBLIC grant, NOT a direct grant — so
-- `revoke ... from anon` alone is a no-op (verified against the live DB: anon
-- still had EXECUTE afterwards because PUBLIC still held it). We must revoke from
-- PUBLIC, then re-grant to the legitimate callers so they keep access:
--   - authenticated: report creation + admin deletes run through the cookie-bound
--     `authenticated` client (RLS-enforced; delete_report_renumber's is_admin()
--     still gates non-admins).
--   - service_role: kept for server-side use.
-- This mirrors the from-public revoke pattern migration 006 used for the booking
-- RPCs. Clears the Supabase security-advisor "anon can execute SECURITY DEFINER
-- function" warning for these two.
--
-- Idempotent: REVOKE/GRANT are no-ops when already in the target state. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

revoke execute on function public.next_report_reference()       from public, anon;
revoke execute on function public.delete_report_renumber(uuid)  from public, anon;

grant  execute on function public.next_report_reference()       to authenticated, service_role;
grant  execute on function public.delete_report_renumber(uuid)  to authenticated, service_role;
