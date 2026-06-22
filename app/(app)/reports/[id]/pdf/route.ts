import type { NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getReportById } from '@/lib/data'
import { IS_DEMO } from '@/lib/env'
import { renderUrlToPdf } from '@/lib/pdf'
import { createPdfToken } from '@/lib/pdf-token'
import { REPORT_PDF_BUCKET, reportPdfCachePath } from '@/lib/pdf-cache'

function pdfHeaders(filename: string): HeadersInit {
  return {
    'Content-Type': 'application/pdf',
    // `inline` so iOS Safari opens the PDF in its viewer (where the user can
    // Share → Save to Files / WhatsApp); desktop still force-downloads it via the
    // blob + download-attribute path in PrintButton.
    'Content-Disposition': `inline; filename="${filename}"`,
    'Cache-Control': 'no-store',
  }
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
  const filename = `${reference || 'inspection-report'}.pdf`
  const cachePath = reportPdfCachePath(id, updatedAt)

  // 1) Serve the pre-rendered PDF if the cache holds this exact version (rendered
  // by the background function on completion, or by a previous download). This is
  // the fast, reliable path — no Chromium, so it can't hit the function timeout.
  try {
    const svc = createServiceClient()
    const { data: cached } = await svc.storage.from(REPORT_PDF_BUCKET).download(cachePath)
    if (cached) {
      return new Response(new Uint8Array(await cached.arrayBuffer()), { headers: pdfHeaders(filename) })
    }
  } catch {
    // Cache unavailable/misconfigured — fall through to a live render.
  }

  // 2) Cache miss — render now (works when the function is warm), return it, and
  // best-effort cache the result so the next download of this version is instant.
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
    try {
      const svc = createServiceClient()
      await svc.storage
        .from(REPORT_PDF_BUCKET)
        .upload(cachePath, new Uint8Array(pdf), { contentType: 'application/pdf', upsert: true })
    } catch {
      // Caching is best-effort; never fail the download because the write failed.
    }
    return new Response(new Uint8Array(pdf), { headers: pdfHeaders(filename) })
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
