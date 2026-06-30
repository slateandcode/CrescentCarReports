/**
 * Shared constants/helpers for the pre-rendered PDF cache (no 'server-only' so the
 * standalone Netlify background function can import it too).
 *
 * The report PDF is rendered with headless Chromium, which is too slow to do
 * synchronously inside the platform's function timeout on a cold start. So we
 * cache the rendered PDF in a private Supabase bucket keyed by the report's
 * `updated_at` (any edit yields a new key, transparently invalidating the cache),
 * and the download route serves the cached copy via a signed URL.
 */
export const REPORT_PDF_BUCKET = 'report-pdfs'

/**
 * Human, filesystem/URL-safe name for a report's PDF, e.g. "CCR-2026-000.pdf".
 *
 * This is also the LAST path segment of the cached object (see
 * reportPdfCachePath), which is what matters on iOS: the download route redirects
 * to a signed URL with no Content-Disposition (so Safari opens the PDF inline in
 * its viewer), and iOS then derives the Share / Save-to-Files / WhatsApp filename
 * from the URL's last segment. Keying the object name on the report reference is
 * what keeps that name "CCR-2026-000.pdf" instead of a raw version timestamp.
 */
export function reportPdfFilename(reference: string | null | undefined): string {
  const base = (reference || '').trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '')
  return `${base || 'inspection-report'}.pdf`
}

/**
 * Storage path for a report's cached PDF: the `updated_at` version is a FOLDER and
 * the human filename is the leaf — `{reportId}/{version}/CCR-2026-000.pdf`. The
 * version folder still invalidates the cache on any edit (new folder), while the
 * leaf gives the signed URL a meaningful last segment for the iOS inline-save name.
 */
export function reportPdfCachePath(
  reportId: string,
  updatedAt: string | null | undefined,
  reference: string | null | undefined,
): string {
  const version = updatedAt ? new Date(updatedAt).getTime() : 0
  return `${reportId}/${version}/${reportPdfFilename(reference)}`
}

/**
 * Legacy (pre-2026-06-30) flat path `{reportId}/{version}.pdf`, used only so the
 * download route can lazily migrate an old cached object to the new versioned-folder
 * layout on first access (a cheap storage copy, no re-render) instead of forcing a
 * fresh Chromium render for every already-cached report.
 */
export function legacyReportPdfCachePath(
  reportId: string,
  updatedAt: string | null | undefined,
): string {
  const version = updatedAt ? new Date(updatedAt).getTime() : 0
  return `${reportId}/${version}.pdf`
}
