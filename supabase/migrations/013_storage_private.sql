-- ════════════════════════════════════════════════════════════════════════
-- 013 — Make report-photos PRIVATE; serve photos via short-lived signed URLs
--
-- SECURITY FIX (HIGH). Migrations 002/009 left the bucket PUBLIC-READ:
--   • 002 created it with public = true.
--   • 002's "report_photos_public_read" SELECT policy had NO `to authenticated`
--     clause and only checked `bucket_id`, so the Storage list/get API was open
--     to ANYONE (including anon). Every customer inspection photo — plates, VINs,
--     damage, documents — was world-readable by URL and freely enumerable.
--
-- This migration flips the bucket to PRIVATE and replaces the open read policy
-- with one scoped to authenticated inspectors who can access the owning report
-- (same can_access_report_storage guard the 009 write policies use). Photos are
-- now served via short-lived signed URLs minted server-side in lib/photo-sign.ts.
--
-- NOTE on the render path: the headless-Chrome PDF render has no auth cookie and
-- loads reports through the SERVICE-ROLE client (createServiceClient), which
-- BYPASSES RLS — so it can still sign any report's photos. RLS here only governs
-- the browser (anon/inspector) clients used by upload/rotate/delete and the
-- editor/preview, which is exactly what we want to lock down.
-- ════════════════════════════════════════════════════════════════════════

-- Flip the bucket to private. Explicit, idempotent UPDATE (rather than touching
-- 002's `insert ... on conflict do update set public = excluded.public`) so that
-- re-running the migration set can never re-publish the bucket.
update storage.buckets set public = false where id = 'report-photos';

-- Drop the wide-open anon-readable SELECT policy from 002.
drop policy if exists "report_photos_public_read" on storage.objects;

-- New SELECT policy: authenticated AND owns/can-access the report folder. Mirrors
-- the 009 write policies (can_access_report_storage parses {report_id} out of the
-- object name and defers to can_access_report). The service-role render path is
-- unaffected — it bypasses RLS entirely.
drop policy if exists "report_photos_owner_read" on storage.objects;
create policy "report_photos_owner_read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'report-photos'
    and public.can_access_report_storage(name)
  );
