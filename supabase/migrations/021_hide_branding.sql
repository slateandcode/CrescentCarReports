-- ════════════════════════════════════════════════════════════════════════
-- 021 — Per-report branding toggle.
--
-- Some client businesses want the inspection report WITHOUT any Crescent Car
-- Check identity on it (white-label). `hide_branding = true` strips the report
-- document of the wordmark, crescent marks/watermarks, "Crescent Car Reports ·
-- by Crescent Car Check" footers, the crescentcarcheck.com line, the "Crescent
-- Score" naming (rendered as "Overall Score") and the company name inside the
-- legal disclaimer text.
--
-- Default FALSE = branded, so every existing and newly-created report keeps the
-- current look unless an inspector flips the switch in the editor (Report Setup
-- card). The column is inspector-editable via the saveReport allowlist
-- (MUTABLE_COLUMNS in app/(app)/reports/actions.ts).
--
-- NOTE deploy order: this migration must be applied BEFORE the app code that
-- writes the column ships — the editor's autosave sends the whole form, so a
-- missing column would fail EVERY save with "column does not exist".
-- ════════════════════════════════════════════════════════════════════════

alter table inspection_reports
  add column if not exists hide_branding boolean not null default false;
