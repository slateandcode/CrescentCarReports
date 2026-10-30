-- ════════════════════════════════════════════════════════════════════════
-- 041 — Cash & Cars report brand.
--
-- Cash and Cars Auctions LLC resell the Premium inspection under their own
-- identity, exactly as Alpha Worldwide do (migration 022): report_brand =
-- 'cashandcars' renders the document with their cover, logo, red palette and
-- cashandcars.ae footers, and drops the legal-disclaimer page.
--
-- The only schema change is widening the check constraint 022 added. Existing
-- rows are untouched.
--
-- NOTE deploy order: apply this BEFORE the app code ships. Until it is applied
-- the "Start Cash & Cars Report" button fails at insert (the old constraint
-- rejects the value), while every other report keeps working.
-- ════════════════════════════════════════════════════════════════════════

alter table inspection_reports
  drop constraint if exists inspection_reports_report_brand_check;

alter table inspection_reports
  add constraint inspection_reports_report_brand_check
  check (report_brand in ('crescent', 'alpha', 'cashandcars'));
