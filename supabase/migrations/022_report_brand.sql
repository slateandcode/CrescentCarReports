-- ════════════════════════════════════════════════════════════════════════
-- 022 — Per-report brand identity (Alpha Worldwide).
--
-- Alpha Worldwide resell the Premium inspection under their own identity, so a
-- report needs to know WHOSE document it is — a separate axis from
-- `package_type` (which inspection depth) and from `hide_branding` (show no
-- identity at all). `report_brand = 'alpha'` renders the document with the
-- Alpha Worldwide cover, logo, blue palette and alphaworldwide.me footers, and
-- drops the legal-disclaimer page (their legal position is their own).
--
-- The inspection itself is unchanged: an Alpha report IS a Premium report
-- (package_type = 'premium'), so templates, scoring and counts are untouched.
--
-- Default 'crescent' = today's document, so every existing report and every
-- Standard/Premium report created from the chooser keeps the current look.
--
-- Brand is chosen once, when the report is created (the "Start Alpha Report"
-- button), and is NOT in the saveReport allowlist (MUTABLE_COLUMNS in
-- app/(app)/reports/actions.ts) — re-branding a live report mid-inspection is
-- not a thing an inspector should be able to do by accident.
--
-- NOTE deploy order: apply this migration BEFORE the app code that reads the
-- column ships. lib/report-brand.ts defaults a missing/unknown value to
-- 'crescent', so an app that runs ahead of the migration degrades to the
-- current document rather than erroring — but the chooser's Alpha button
-- would silently produce a Crescent report until the column exists.
-- ════════════════════════════════════════════════════════════════════════

alter table inspection_reports
  add column if not exists report_brand text not null default 'crescent';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'inspection_reports_report_brand_check'
  ) then
    alter table inspection_reports
      add constraint inspection_reports_report_brand_check
      check (report_brand in ('crescent', 'alpha'));
  end if;
end $$;
