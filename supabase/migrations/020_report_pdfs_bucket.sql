-- ════════════════════════════════════════════════════════════════════════
-- 020 — Track the report-pdfs cache bucket in migrations.
--
-- Commit ed764b0 added the background PDF pre-render + cache, which stores
-- rendered PDFs in storage bucket `report-pdfs`, but never added a migration to
-- create it — the bucket was provisioned by hand in the Supabase dashboard. This
-- migration records it so a fresh environment (db reset / new project) provisions
-- the same bucket and the cache path works there too.
--
-- `on conflict (id) do nothing`: PRODUCTION already has this bucket (created
-- 2026-06-22 with file_size_limit = null / unlimited). We deliberately DON'T
-- touch its settings here — re-running migrations must never shrink the live
-- bucket's size limit (a real report PDF can be ~25-30 MB of photos).
--
-- PRIVATE bucket, no storage.objects policies: the only readers/writers are the
-- background function and the download route, both of which use the SERVICE-ROLE
-- client (createServiceClient), which BYPASSES RLS. With no anon/authenticated
-- policy the cached PDFs aren't reachable by browser clients directly; downloads
-- are gated by the app's own auth in the route handler, which then hands out a
-- short-lived signed URL for the file.
-- ════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'report-pdfs',
  'report-pdfs',
  false,
  null, -- unlimited, matching the live bucket (report PDFs can be ~25-30 MB)
  array['application/pdf']
)
on conflict (id) do nothing;
