import 'server-only'

/**
 * Fire-and-forget: ask the Netlify background function to (re-)render a report's
 * PDF into the Supabase cache, so the next download is an instant signed-URL hit
 * instead of a cold-start Chromium render on the request path.
 *
 * The cache is keyed on the report's `updated_at` (lib/pdf-cache.ts), so ANY
 * write to the row — a post-completion edit, an admin inspector reassignment, a
 * reopen — orphans the previously cached PDF. Every such writer should call this
 * afterwards; the background function reads the CURRENT updated_at when it runs,
 * so the last call always converges the cache onto the latest version.
 *
 * Awaits only the invocation ack (a 202 from Netlify), not the render itself.
 * Never throws into the caller — the download route still renders on demand (and
 * can serve the newest cached copy) if this didn't run, e.g. in local dev where
 * there's no Netlify functions runtime.
 */
export async function triggerPdfPrerender(id: string, originFallback?: string): Promise<void> {
  const secret = process.env.PDF_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  const base = (process.env.NEXT_PUBLIC_APP_URL || process.env.URL || originFallback || '').replace(
    /\/$/,
    '',
  )
  if (!secret || !base) return
  try {
    await fetch(`${base}/.netlify/functions/render-report-pdf-background`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId: id, auth: secret }),
    })
  } catch {
    // Best-effort pre-warm; the download route renders on demand if it didn't run.
  }
}
