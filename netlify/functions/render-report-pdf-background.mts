// Pre-renders a report's PDF off the request path and caches it in Supabase, so
// the download route can serve it instantly. Headless-Chromium rendering is too
// slow for the synchronous function timeout on a cold start; a *background*
// function (the `-background` suffix) gets a ~15-minute budget, so the ~66MB pack
// download + render fits comfortably.
//
// Triggered fire-and-forget when a report is completed (lib → completeReport).
// Authorised by a shared secret (the service-role key) so only the app can invoke
// it. Best-effort throughout: the download route still renders on demand if the
// cache is empty, so a failure here never blocks a download.

import puppeteer from 'puppeteer-core'
import chromium from '@sparticuz/chromium-min'
import { createClient } from '@supabase/supabase-js'
import { createHmac } from 'node:crypto'

const REPORT_PDF_BUCKET = 'report-pdfs'
const CHROMIUM_PACK_URL =
  process.env.CHROMIUM_PACK_URL ||
  'https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar'

const handler = async (req: Request): Promise<Response> => {
  const secret = process.env.PDF_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret || !supabaseUrl || !serviceKey) return new Response('not configured', { status: 500 })

  let body: { reportId?: string; auth?: string } = {}
  try {
    body = await req.json()
  } catch {
    /* empty body */
  }
  if (body.auth !== secret) return new Response('forbidden', { status: 403 })
  const reportId = body.reportId
  if (!reportId) return new Response('missing reportId', { status: 400 })

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  const { data: rep } = await supabase
    .from('inspection_reports')
    .select('updated_at')
    .eq('id', reportId)
    .maybeSingle()
  if (!rep) return new Response('not found', { status: 404 })
  const version = rep.updated_at ? new Date(rep.updated_at).getTime() : 0
  const cachePath = `${reportId}/${version}.pdf`

  // Mint the same short-lived render token the /render page verifies.
  const exp = Date.now() + 5 * 60 * 1000
  const sig = createHmac('sha256', secret).update(`${reportId}.${exp}`).digest('base64url')
  const token = `${exp}.${sig}`
  const siteUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.URL || '').replace(/\/$/, '')
  if (!siteUrl) return new Response('no site url', { status: 500 })
  const target = `${siteUrl}/render/${reportId}?pdf=${encodeURIComponent(token)}`

  chromium.setGraphicsMode = false
  const browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(CHROMIUM_PACK_URL),
    headless: true,
    args: chromium.args,
  })
  try {
    const page = await browser.newPage()
    await page.goto(target, { waitUntil: 'load', timeout: 90000 })
    await page.evaluate(async () => {
      const imgs = Array.from(document.images)
      await Promise.all(
        imgs.map((img) => {
          try {
            img.loading = 'eager'
          } catch {}
          if (img.complete) return img.decode().catch(() => undefined)
          return new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true })
            img.addEventListener('error', () => resolve(), { once: true })
          })
        }),
      )
    })
    const pdf = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    })
    await supabase.storage
      .from(REPORT_PDF_BUCKET)
      .upload(cachePath, Buffer.from(pdf), { contentType: 'application/pdf', upsert: true })

    // Drop stale versions of this report's cached PDF.
    const { data: list } = await supabase.storage.from(REPORT_PDF_BUCKET).list(reportId)
    if (list) {
      const stale = list.filter((f) => f.name !== `${version}.pdf`).map((f) => `${reportId}/${f.name}`)
      if (stale.length) await supabase.storage.from(REPORT_PDF_BUCKET).remove(stale)
    }
    return new Response('ok')
  } catch (err) {
    console.error('[render-report-pdf-background] failed', err)
    return new Response('render failed', { status: 500 })
  } finally {
    await browser.close()
  }
}

export default handler
