/**
 * Shared constants for the pre-rendered PDF cache (no 'server-only' so the
 * standalone Netlify background function can import it too).
 *
 * The report PDF is rendered with headless Chromium, which is too slow to do
 * synchronously inside the platform's function timeout on a cold start. So we
 * cache the rendered PDF in a private Supabase bucket keyed by the report's
 * `updated_at` (any edit yields a new key, transparently invalidating the cache),
 * and the download route serves the cached copy instantly when present.
 */
export const REPORT_PDF_BUCKET = 'report-pdfs'

/** Storage path for a report's cached PDF, versioned by its updated_at. */
export function reportPdfCachePath(reportId: string, updatedAt: string | null | undefined): string {
  const version = updatedAt ? new Date(updatedAt).getTime() : 0
  return `${reportId}/${version}.pdf`
}
