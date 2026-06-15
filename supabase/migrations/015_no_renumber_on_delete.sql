-- ════════════════════════════════════════════════════════════════════════
-- 015 — Stop renumbering report references on delete (keep them IMMUTABLE)
--
-- delete_report_renumber (003, re-secured in 010) re-sequenced ALL of a year's
-- report_reference values after a delete so the numbering stayed gapless. But
-- report_reference (CCR-YYYY-000N) is an EXTERNALLY-SHARED identifier — it is
-- printed on delivered PDFs. Renumbering made an already-issued CCR number point
-- at a different car, and let two historical PDFs claim the same number.
--
-- References must be immutable once issued; gaps after a delete are normal and
-- harmless (and next_report_reference keeps the counter monotonic on its own, so
-- new reports never reuse a number). Re-create the function to ONLY delete,
-- admin-gated exactly as in 010, with NO renumbering and NO counter reset.
--
-- The function name is kept (it is now a slight misnomer) so the single caller —
-- deleteReport in app/(app)/reports/actions.ts, which does
-- rpc('delete_report_renumber', ...) — needs no change. CREATE OR REPLACE
-- preserves the existing grants.
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.delete_report_renumber(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Admin-only (matches the reports_delete_admin policy + the server-action gate).
  if not public.is_admin() then
    raise exception 'Only admins can delete reports';
  end if;

  delete from public.inspection_reports where id = p_report_id;
end;
$$;
