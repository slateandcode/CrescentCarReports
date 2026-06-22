import type { NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth'
import { getReportById } from '@/lib/data'
import { renderUrlToPdf } from '@/lib/pdf'
import { createPdfToken } from '@/lib/pdf-token'

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

  const report = await getReportById(id)
  if (!report) return new Response('Report not found.', { status: 404 })

  // Render the bare print surface. Use this request's own origin so it works on
  // whatever port/host the app is running on. Headless Chrome has no auth
  // cookie, so we pass a short-lived signed token that authorises this one
  // report's render server-side (/render 404s without a valid token).
  const origin = _req.nextUrl.origin
  // Mint the short-lived render token lazily: renderUrlToPdf invokes this AFTER
  // the browser launches (i.e. after the serverless Chromium cold-start
  // download), so a slow cold start can't expire the token before /render
  // verifies it.
  const makeUrl = () => {
    const token = createPdfToken(id)
    return `${origin}/render/${id}?pdf=${encodeURIComponent(token)}`
  }

  try {
    const pdf = await renderUrlToPdf(makeUrl)
    const filename = `${report.report_reference || 'inspection-report'}.pdf`
    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        // `inline` so iOS Safari opens the PDF in its viewer (where the user can
        // Share → Save to Files / WhatsApp); desktop still force-downloads it via
        // the blob + download-attribute path in PrintButton.
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
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
