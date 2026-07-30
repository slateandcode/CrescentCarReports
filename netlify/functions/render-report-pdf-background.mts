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
// Share the cache path/name logic with the download route so the pre-render writes
// to exactly the path the route reads from — any drift here is a silent permanent
// cache miss (the very bug class this cache exists to avoid).
import { REPORT_PDF_BUCKET, reportPdfCachePath } from '../../lib/pdf-cache'

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
    .select('updated_at, report_reference')
    .eq('id', reportId)
    .maybeSingle()
  if (!rep) return new Response('not found', { status: 404 })
  const version = rep.updated_at ? new Date(rep.updated_at).getTime() : 0
  const cachePath = reportPdfCachePath(reportId, rep.updated_at, rep.report_reference)
  const leafName = cachePath.slice(cachePath.lastIndexOf('/') + 1)

  // Drop stale versions of this report's cached PDF. `list(reportId)` returns
  // version folders (new layout) and legacy flat `{version}.pdf` files; both
  // names start with the ms-timestamp version, so parseInt covers both. Only
  // remove versions STRICTLY OLDER than this run's: two renders can overlap
  // (each save of a completed report triggers one), and the run holding the
  // older version must never delete the newer run's freshly-cached PDF — that
  // re-orphaned the cache this function exists to fill. An extra stale folder
  // left behind by the losing run is harmless and swept by the next render.
  // A folder entry has no `id`; a legacy flat file does.
  //
  // NEVER call this unless the current version is actually cached — sweeping
  // after a failed upload leaves the report with NO cached PDF at all, which
  // forces every later download onto the fragile cold-start live render.
  const sweepStaleVersions = async () => {
    // `limit` must be explicit: storage-js defaults to 100 entries sorted by
    // NAME ASCENDING, i.e. only the oldest 100 versions, so a backlog longer
    // than that could never be drained.
    const { data: list } = await supabase.storage
      .from(REPORT_PDF_BUCKET)
      .list(reportId, { limit: 1000 })
    if (!list) return
    const staleEntries = list.filter((f) => {
      const v = Number.parseInt(f.name, 10)
      return Number.isFinite(v) && v < version
    })
    const stale: string[] = []
    for (const f of staleEntries) {
      if (f.id) {
        // Legacy flat object `{version}.pdf`.
        stale.push(`${reportId}/${f.name}`)
      } else {
        // Version folder — delete its ACTUAL contents (the leaf filename can
        // differ from the current reference if the report was renumbered).
        const { data: contents } = await supabase.storage
          .from(REPORT_PDF_BUCKET)
          .list(`${reportId}/${f.name}`, { limit: 1000 })
        for (const c of contents ?? []) stale.push(`${reportId}/${f.name}/${c.name}`)
      }
    }
    if (stale.length) await supabase.storage.from(REPORT_PDF_BUCKET).remove(stale)
  }

  // Already rendered? Every save of a completed report fires one of these, and the
  // download route fires one alongside its own live render, so duplicate triggers
  // for a version that is already cached are routine. Skip the (expensive) render
  // but still sweep, in case the run that cached it failed to. Match the EXACT leaf
  // the download route reads — a differently-named PDF in this version folder (the
  // report was renumbered) is a cache miss for the route, so it must be re-rendered.
  const { data: alreadyCached } = await supabase.storage
    .from(REPORT_PDF_BUCKET)
    .list(`${reportId}/${version}`, { limit: 1000 })
  if (alreadyCached?.some((f) => f.name === leafName)) {
    await sweepStaleVersions()
    return new Response('already cached')
  }

  // Mint the same short-lived render token the /render page verifies.
  const exp = Date.now() + 5 * 60 * 1000
  const sig = createHmac('sha256', secret).update(`${reportId}.${exp}`).digest('base64url')
  const token = `${exp}.${sig}`
  const siteUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.URL || '').replace(/\/$/, '')
  if (!siteUrl) return new Response('no site url', { status: 500 })
  const target = `${siteUrl}/render/${reportId}?pdf=${encodeURIComponent(token)}`

  // Launch is guarded separately from the render: fetching the ~66MB Chromium pack
  // is the most common failure here, and when it threw out of the handler it did so
  // with NO log line (the catch below only covers the render), leaving the exact
  // failure mode we most need to diagnose invisible.
  chromium.setGraphicsMode = false
  let browser: Awaited<ReturnType<typeof puppeteer.launch>>
  try {
    browser = await puppeteer.launch({
      executablePath: await chromium.executablePath(CHROMIUM_PACK_URL),
      headless: true,
      args: chromium.args,
    })
  } catch (err) {
    console.error('[render-report-pdf-background] chromium launch failed', err)
    return new Response('launch failed', { status: 500 })
  }
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
    // MUST be checked: supabase-js storage returns { error } and does NOT throw.
    // Ignoring it meant a failed upload fell straight through to the stale sweep
    // below, which then deleted every OLDER cached render — leaving the report
    // with no cached PDF at all and turning the next download into a guaranteed
    // cold-start render (and, when that timed out, a hard "Could not generate the
    // PDF" with nothing to fall back to). Bail out and keep the old cache instead.
    const { error: uploadError } = await supabase.storage
      .from(REPORT_PDF_BUCKET)
      .upload(cachePath, Buffer.from(pdf), { contentType: 'application/pdf', upsert: true })
    if (uploadError) {
      console.error('[render-report-pdf-background] upload failed', uploadError)
      return new Response('upload failed', { status: 500 })
    }

    // Only now that THIS version is safely cached is it sound to drop older ones.
    await sweepStaleVersions()
    return new Response('ok')
  } catch (err) {
    console.error('[render-report-pdf-background] failed', err)
    return new Response('render failed', { status: 500 })
  } finally {
    await browser.close().catch(() => {})
  }
}

export default handler
