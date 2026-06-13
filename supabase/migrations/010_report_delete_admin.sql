-- ════════════════════════════════════════════════════════════════════════
-- 010 — Restrict report deletion to admins (match migration 008's intent)
--
-- SECURITY FIX. Migration 008 tightened the inspection_reports DELETE *policy* to
-- admins only ("inspectors create and edit their OWN reports but may never delete
-- a report"). But deletion goes through delete_report_renumber, a SECURITY
-- DEFINER function that BYPASSES RLS and still authorised via can_access_report
-- (own-report OR admin). Supabase's default privileges also leave EXECUTE granted
-- to `authenticated`, so a non-admin inspector could call it directly over
-- /rest/v1/rpc and delete their own report (and re-sequence everyone's
-- references), defeating 008.
--
-- Re-create the function with an is_admin() guard — same self-checking pattern as
-- admin_create_booking — so it matches the reports_delete_admin policy and the
-- server-action check in app/(app)/reports/actions.ts. Body is otherwise
-- identical to 003. CREATE OR REPLACE preserves existing grants.
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.delete_report_renumber(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year int;
begin
  -- Admin-only (was can_access_report — own-or-admin — which defeated 008).
  if not public.is_admin() then
    raise exception 'Only admins can delete reports';
  end if;

  -- Capture the report's year (from its reference) before it's removed.
  select (substring(report_reference from 'CCR-([0-9]+)-'))::int
    into v_year
  from public.inspection_reports
  where id = p_report_id;

  delete from public.inspection_reports where id = p_report_id;

  if v_year is null then
    return;
  end if;

  -- Capture the new numbering BEFORE parking, preserving the existing
  -- reference order (so 0003→0002, 0004→0003 after 0002 is removed).
  create temp table _renum on commit drop as
    select id, row_number() over (order by report_reference) as rn
    from public.inspection_reports
    where report_reference like 'CCR-' || v_year || '-%';

  -- Phase 1 — park this year's references at unique temporary values.
  update public.inspection_reports
  set report_reference = 'TMP-' || id::text
  where report_reference like 'CCR-' || v_year || '-%';

  -- Phase 2 — assign gapless CCR-YYYY-000N in the captured order.
  update public.inspection_reports r
  set report_reference = 'CCR-' || v_year || '-' || lpad(t.rn::text, 4, '0')
  from _renum t
  where r.id = t.id;

  -- Keep the per-year counter in step so the next reference continues cleanly.
  insert into public.report_counters (year, last_seq)
  values (
    v_year,
    (select count(*) from public.inspection_reports
     where report_reference like 'CCR-' || v_year || '-%')
  )
  on conflict (year) do update set last_seq = excluded.last_seq;
end;
$$;
