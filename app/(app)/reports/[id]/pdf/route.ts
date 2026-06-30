import type { NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getReportById } from '@/lib/data'
import { IS_DEMO } from '@/lib/env'
import { renderUrlToPdf } from '@/lib/pdf'
import { createPdfToken } from '@/lib/pdf-token'
import {
  REPORT_PDF_BUCKET,
  reportPdfCachePath,
  reportPdfFilename,
  legacyReportPdfCachePath,
} from '@/lib/pdf-cache'

// Redirect the client to a short-lived signed URL for the cached PDF in Supabase
// Storage, instead of streaming the bytes back through this function.
//
// WHY: Netlify Functions are Lambda-backed and cap the *synchronous response
// body* at ~6 MB. A real report renders to a ~25-30 MB PDF (lots of photos), so
// returning it inline overflowed that limit — the invocation failed and the
// fronting Next middleware edge handler surfaced it as "This edge function has
// crashed: edge function invocation failed" (small reports under 6 MB worked,
// big ones didn't). Handing back a 302 to a signed URL keeps the response tiny;
// the phone pulls the file straight from Supabase's CDN with no size ceiling.
//
// `asDownload` controls the disposition Supabase serves the file with:
//   • false → inline, so iOS Safari opens it in its viewer (Share → Save / WhatsApp)
//   • true  → attachment, so a desktop browser saves it to disk
// Returns null when the object isn't cached yet (so the caller can render it).
async function signedPdfRedirect(
  svc: ReturnType<typeof createServiceClient>,
  cachePath: string,
  filename: string,
  asDownload: boolean,
): Promise<Response | null> {
  const { data, error } = await svc.storage
    .from(REPORT_PDF_BUCKET)
    .createSignedUrl(cachePath, 300, asDownload ? { download: filename } : undefined)
  if (error || !data?.signedUrl) return null
  const url = data.signedUrl.startsWith('http')
    ? data.signedUrl
    : `${process.env.NEXT_PUBLIC_SUPABASE_URL}${data.signedUrl}`
  return new Response(null, { status: 302, headers: { Location: url, 'Cache-Control': 'no-store' } })
}

// Needs the Node runtime (spawns a Chrome process) and must never be cached.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Headless-Chromium PDF generation is slow on a serverless cold start: the
// @sparticuz/chromium-min pack (~50MB) is fetched to /tmp, then the image-heavy
// report is rendered. The platform default (~10s on Netlify) kills that mid-flight,
// which 500s the route and drops the client onto the window.print() fallback (the
// "prints the editor / weird format" bug). The Netlify Next runtime reads this
// export to size the function timeout. Keep it generous; a warm render is fast.
export const maxDuration = 60

/**
 * GET /reports/:id/pdf — returns a true A4 PDF of the report, rendered
 * server-side with headless Chrome so the output is dimensionally correct
 * regardless of the user's browser print dialog. The client falls back to
 * window.print() if this fails (e.g. no Chrome binary on the host).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireUser()

  // Lightweight authorised lookup (RLS-scoped): enough to authorise the request,
  // name the file, and key the cache — no need to fetch/sign the whole report here
  // (the render surface fetches its own data). 404 also covers "not your report".
  // Demo mode has no Supabase, so route through the demo-aware data helper.
  let reference: string | null = null
  let updatedAt: string | null = null
  if (IS_DEMO) {
    const report = await getReportById(id)
    if (!report) return new Response('Report not found.', { status: 404 })
    reference = report.report_reference
    updatedAt = report.updated_at
  } else {
    const supabase = await createClient()
    const { data: report } = await supabase
      .from('inspection_reports')
      .select('report_reference, updated_at')
      .eq('id', id)
      .maybeSingle()
    if (!report) return new Response('Report not found.', { status: 404 })
    reference = report.report_reference
    updatedAt = report.updated_at
  }
  const filename = reportPdfFilename(reference)
  // New layout `{id}/{version}/CCR-2026-000.pdf`: the report reference is the
  // object's leaf, so the iOS inline signed URL ends in a meaningful filename.
  const cachePath = reportPdfCachePath(id, updatedAt, reference)
  // Old flat layout `{id}/{version}.pdf` from before 2026-06-30 — still served by
  // lazily copying it into the new layout (a cheap storage copy, no re-render).
  const legacyPath = legacyReportPdfCachePath(id, updatedAt)
  // Desktop asks for an attachment (save to disk) via ?download=1; iOS omits it so
  // the PDF opens inline in Safari's viewer. See signedPdfRedirect.
  const asDownload = _req.nextUrl.searchParams.get('download') === '1'

  // 1) Serve the pre-rendered PDF if the cache holds this exact version (rendered
  // by the background function on completion, or by a previous download). We hand
  // back a 302 to a signed URL rather than the bytes — no Chromium AND no ~6 MB
  // function-response ceiling, so a big report can't crash the function.
  try {
    const svc = createServiceClient()
    let redirect = await signedPdfRedirect(svc, cachePath, filename, asDownload)
    if (redirect) return redirect
    // Legacy object cached under the old flat name? Migrate it to the new layout
    // once (server-side copy — no Chromium). Ignore the copy's result: whether it
    // succeeded, or lost a race to a concurrent request that already created the
    // new object (a "destination exists" error), the new path may now exist — so
    // just try to sign it again before falling back to a live render.
    await svc.storage.from(REPORT_PDF_BUCKET).copy(legacyPath, cachePath)
    redirect = await signedPdfRedirect(svc, cachePath, filename, asDownload)
    if (redirect) return redirect
  } catch {
    // Cache unavailable/misconfigured — fall through to a live render.
  }

  // 2) Cache miss — render now (works when the function is warm), cache it, then
  // redirect to the freshly-cached copy. The rendered bytes are uploaded to
  // storage and handed back as a signed URL, never returned as the function body.
  const origin = _req.nextUrl.origin
  // Mint the short-lived render token lazily: renderUrlToPdf invokes this AFTER
  // the browser launches (i.e. after the serverless Chromium cold-start download),
  // so a slow cold start can't expire the token before /render verifies it.
  const makeUrl = () => {
    const token = createPdfToken(id)
    return `${origin}/render/${id}?pdf=${encodeURIComponent(token)}`
  }
  try {
    const pdf = await renderUrlToPdf(makeUrl)
    const svc = createServiceClient()
    const { error: uploadError } = await svc.storage
      .from(REPORT_PDF_BUCKET)
      .upload(cachePath, new Uint8Array(pdf), { contentType: 'application/pdf', upsert: true })
    if (uploadError) throw uploadError
    const redirect = await signedPdfRedirect(svc, cachePath, filename, asDownload)
    if (redirect) return redirect
    throw new Error('Could not sign the freshly-rendered PDF.')
  } catch (err) {
    // Log the real error server-side, but return a generic body — never leak the
    // internal Chromium/launch error text to the client (it can surface verbatim
    // in the iOS viewer on a failed render).
    console.error('[pdf] render failed', err)
    return new Response(
      "Could not generate the PDF. Please use your browser's Print / Save as PDF instead.",
      { status: 500, headers: { 'Content-Type': 'text/plain' } },
    )
  }
}
