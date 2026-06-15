-- ════════════════════════════════════════════════════════════════════════
-- 012 — Close the inspector → admin privilege-escalation hole
--
-- SECURITY FIX (critical). The "profiles_update_own_or_admin" RLS policy
-- (001_init.sql) lets a user UPDATE their OWN inspector_profiles row, with no
-- restriction on WHICH columns. Supabase grants the `authenticated`/`anon`
-- roles table-wide UPDATE by default, so any signed-in inspector could PATCH
-- their own row via PostgREST to set role='admin' (full access to every
-- customer's PII, report deletion, team management, invites) or status='active'
-- to undo a suspension — the entire admin boundary was bypassable by one REST
-- call.
--
-- Fix: revoke column-wide UPDATE from the public roles and re-grant UPDATE only
-- on the columns an inspector legitimately self-edits:
--   • full_name, phone        — updateMyProfile (settings/actions.ts)
--   • last_activity_at        — the sliding-session bump in middleware.ts
-- role/status stay un-grantable to authenticated, so they can ONLY be changed
-- by the service-role admin server actions (setMemberStatus / invite redeem),
-- which bypass column grants. The RLS row filter (own-or-admin) is unchanged.
--
-- Column GRANTs are checked against the columns named in an UPDATE's SET list,
-- so the set_updated_at() BEFORE trigger (which writes updated_at) is unaffected.
-- ════════════════════════════════════════════════════════════════════════

revoke update on public.inspector_profiles from authenticated;
revoke update on public.inspector_profiles from anon;

grant update (full_name, phone, last_activity_at)
  on public.inspector_profiles
  to authenticated;
