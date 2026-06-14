-- ════════════════════════════════════════════════════════════════════════
-- 011 · Prune checklist keys for checks removed in the brief-2 template update
--
-- Reports created before that update still carry stored entries for checks that
-- no longer exist in the template (the old 5-row Accident History, the removed
-- "AC temperature reading", "Battery voltage", "Battery & electrical system
-- review", and the 4 old endoscopic rows). The app already IGNORES orphaned keys
-- when counting/scoring (lib/report-utils.ts), so this migration is optional
-- tidy-up: it makes the stored JSONB match the current template.
--
-- Safe + idempotent: `#-` removes the element at a path and is a no-op when the
-- path is absent, so re-running changes nothing and present data is untouched
-- except for the named dead keys.
-- ════════════════════════════════════════════════════════════════════════
update public.inspection_reports
set checklist = checklist
  #- '{accident-history,vin-recorded}'
  #- '{accident-history,search-completed}'
  #- '{accident-history,salvage-record}'
  #- '{accident-history,search-notes}'
  #- '{interior,ac-temp}'
  #- '{electrical-obd,battery-voltage}'
  #- '{electrical-obd,electrical-review}'
  #- '{endoscopic,cylinder-bore}'
  #- '{endoscopic,inner-cavities}'
  #- '{endoscopic,hidden-corrosion}'
  #- '{endoscopic,behind-trims}'
where checklist ?| array['accident-history','interior','electrical-obd','endoscopic'];
