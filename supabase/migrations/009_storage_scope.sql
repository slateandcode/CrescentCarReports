-- ════════════════════════════════════════════════════════════════════════
-- 009 — Scope report-photo storage writes to the owning report's folder
--
-- SECURITY FIX. Migration 002 created the report-photos write policies with only
-- `bucket_id = 'report-photos'` and NO folder/ownership scoping, despite the
-- file header claiming writes are "scoped to a report folder". Photo upload /
-- rotate / delete all run CLIENT-SIDE (lib/photo-client.ts, browser anon client +
-- the inspector's JWT), so the bucket-wide policy was the ONLY guard: any
-- authenticated inspector could overwrite (.upload upsert) or delete
-- (.remove) ANY other report's evidence photos by passing that report's path.
--
-- Photos are stored at `report-photos/{report_id}/...` (see uploadPhoto), so we
-- scope each write to the report the user can actually access — the same rule the
-- inspection_reports / report_photos rows already use (can_access_report:
-- inspector_id = auth.uid() OR is_admin()).
-- ════════════════════════════════════════════════════════════════════════

-- Safe wrapper: pull the first path segment ({report_id}), validate it is a uuid,
-- and defer to can_access_report. Returns false (deny) on a missing/malformed
-- path instead of letting a bad ::uuid cast raise inside the policy.
create or replace function public.can_access_report_storage(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_first text;
  v_id    uuid;
begin
  v_first := (storage.foldername(object_name))[1];
  if v_first is null or v_first = '' then
    return false;
  end if;
  begin
    v_id := v_first::uuid;
  exception when others then
    return false;
  end;
  return public.can_access_report(v_id);
end;
$$;

revoke all on function public.can_access_report_storage(text) from public, anon;
grant execute on function public.can_access_report_storage(text) to authenticated;

-- Replace the bucket-wide write policies with folder-scoped ones.
drop policy if exists "report_photos_auth_insert" on storage.objects;
drop policy if exists "report_photos_auth_update" on storage.objects;
drop policy if exists "report_photos_auth_delete" on storage.objects;

create policy "report_photos_auth_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'report-photos'
    and public.can_access_report_storage(name)
  );

create policy "report_photos_auth_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'report-photos'
    and public.can_access_report_storage(name)
  )
  with check (
    bucket_id = 'report-photos'
    and public.can_access_report_storage(name)
  );

create policy "report_photos_auth_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'report-photos'
    and public.can_access_report_storage(name)
  );

-- Public read is unchanged (report_photos_public_read from 002): the bucket stays
-- public-read so <img>/PDF rendering loads without signed URLs.
