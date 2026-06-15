import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { PHOTO_BUCKET, pathFromStorageUrl } from '@/lib/utils'
import type { InspectionReport, PhotoRef } from '@/lib/report-types'

/**
 * Re-sign every photo URL in a report from its durable Storage `path`.
 *
 * The report-photos bucket is PRIVATE (migration 013), so the `url` stored in the
 * report JSON (a signed URL minted at upload time) will have expired by the time
 * a report is re-opened. This helper takes the report fresh from the DB and swaps
 * every photo `url` for a freshly-signed one derived from its `path`, in a SINGLE
 * batch round-trip — so the editor, preview and the headless-Chrome PDF render all
 * load images on a private bucket.
 *
 * Works with EITHER the RLS client (editor/preview, scoped to the inspector) or
 * the service-role client (PDF render, bypasses RLS). It never mutates the DB —
 * only the in-memory object returned to the caller — and never throws: on any
 * signing error it leaves the original url in place and logs to console.error, so
 * a broken signer can never 500 a report. Callers must NOT invoke this in demo
 * mode (demo photos aren't in Storage; their urls must be left untouched).
 */

/**
 * Signed-URL TTL (seconds). 24h comfortably outlives an editing/preview session
 * and the PDF render. MUST match SIGNED_URL_TTL_SECONDS in lib/photo-client.ts.
 */
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24

/** Every PhotoRef in the report, across all four locations, as a flat list. */
function collectPhotoRefs(report: InspectionReport): PhotoRef[] {
  const refs: PhotoRef[] = []

  // 1. Top-level gallery photos.
  if (Array.isArray(report.photos)) refs.push(...report.photos)

  // 2. Checklist item photos: checklist[sectionId][itemId].photos[].
  const checklist = report.checklist
  if (checklist && typeof checklist === 'object') {
    for (const section of Object.values(checklist)) {
      if (!section || typeof section !== 'object') continue
      for (const item of Object.values(section)) {
        if (item && Array.isArray(item.photos)) refs.push(...item.photos)
      }
    }
  }

  // 3 + 4. Critical findings: single `photo` (nullable) and `photos[]`.
  if (Array.isArray(report.critical_findings)) {
    for (const f of report.critical_findings) {
      if (f?.photo) refs.push(f.photo)
      if (Array.isArray(f?.photos)) refs.push(...f.photos)
    }
  }

  return refs
}

export async function signReportPhotos<T extends InspectionReport>(
  supabase: SupabaseClient,
  report: T,
): Promise<T> {
  try {
    const refs = collectPhotoRefs(report)

    // The scalar main image is a bare URL with no stored path — recover the path
    // from the URL (old public OR already-signed form).
    const mainUrl = report.main_vehicle_image_url
    const mainPath = mainUrl ? pathFromStorageUrl(mainUrl) : null

    // Collect every DISTINCT path to sign (refs share objects across the four
    // locations — e.g. auto-findings inherit checklist PhotoRefs — and the same
    // path can repeat; dedupe so we sign each once).
    const paths = new Set<string>()
    for (const ref of refs) if (ref?.path) paths.add(ref.path)
    if (mainPath) paths.add(mainPath)

    if (paths.size === 0) return report

    // ONE batch round-trip for all paths.
    const pathList = [...paths]
    const { data, error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .createSignedUrls(pathList, SIGNED_URL_TTL_SECONDS)
    if (error || !data) {
      console.error('[signReportPhotos] batch sign failed', error)
      return report
    }

    // Map path → fresh signed url (skip per-item errors / nulls).
    const signedByPath = new Map<string, string>()
    for (const row of data) {
      if (row.path && row.signedUrl && !row.error) signedByPath.set(row.path, row.signedUrl)
    }

    // Re-derive each ref's url from its path. Mutating these shared objects also
    // covers auto-derived critical findings (they reuse the checklist PhotoRefs).
    // Leave the original url if a path didn't sign — never blank it out.
    for (const ref of refs) {
      if (ref?.path) {
        const signed = signedByPath.get(ref.path)
        if (signed) ref.url = signed
      }
    }

    // Re-sign the scalar main image (only if we parsed a path and it signed).
    if (mainPath) {
      const signed = signedByPath.get(mainPath)
      if (signed) report.main_vehicle_image_url = signed
    }

    return report
  } catch (e) {
    // A broken signer must NEVER 500 the report — fall back to the stored urls.
    console.error('[signReportPhotos] unexpected error', e)
    return report
  }
}
