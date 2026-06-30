import 'server-only'
import { existsSync } from 'node:fs'

/**
 * Server-side PDF rendering with headless Chromium via puppeteer-core.
 *
 * Two execution environments, auto-detected:
 *   • Local dev (Windows/Mac/Linux with a browser installed) — drives the
 *     locally-installed Chrome/Edge found by findChrome().
 *   • Serverless (Netlify functions, no system browser) — uses
 *     @sparticuz/chromium-min, which carries NO bundled binary; the Chromium
 *     "pack" is fetched from CHROMIUM_PACK_URL at runtime and extracted to /tmp.
 *     This is what makes "Download PDF" work in production (and therefore on
 *     phones). The previous bundled @sparticuz/chromium relied on Next/Netlify
 *     file-tracing to ship the binary, which silently dropped it — the function
 *     then threw "input directory .../bin does not exist" and the page 500'd.
 *
 * Produces a true A4 page (the report CSS declares `@page { size: 210mm 297mm;
 * margin: 0 }`, honoured via preferCSSPageSize) edge-to-edge with backgrounds.
 */

const CHROME_CANDIDATES: string[] = [
  process.env.CHROME_PATH,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  // Windows
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  // macOS
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  // Linux
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter((p): p is string => Boolean(p))

/** Path to a locally-installed Chrome/Edge, or null on hosts without one. */
export function findChrome(): string | null {
  for (const p of CHROME_CANDIDATES) {
    if (existsSync(p)) return p
  }
  return null
}

/**
 * Where the serverless Chromium binary is fetched from at runtime.
 * @sparticuz/chromium-min ships no binary, so it downloads this "pack" and
 * extracts it to /tmp on the first (cold) request, then reuses it on warm
 * invocations. This sidesteps the function-bundle file-tracing that was
 * dropping the binary. Override with CHROMIUM_PACK_URL (e.g. a faster
 * self-hosted copy on Supabase Storage). The pack version MUST match the
 * installed @sparticuz/chromium-min version (149.0.0).
 */
const CHROMIUM_PACK_URL =
  process.env.CHROMIUM_PACK_URL ||
  'https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar'

/**
 * Render a URL to a PDF buffer via headless Chromium. `url` may be a thunk, which
 * is resolved AFTER the browser launches — used so the PDF route mints its
 * short-lived render token only once the (slow) serverless Chromium cold-start
 * download has completed, instead of before it (which risked the token expiring
 * mid-cold-start and 500-ing the render).
 *
 * The whole thing (launch + render) is bounded by `timeoutMs`. On a serverless
 * cache miss a cold render can run long; if it would overrun the platform's
 * function budget the function gets hard-KILLED mid-flight, and because the route
 * sits behind the Next middleware edge handler that kill surfaces to the user as
 * "This edge function has crashed". Failing our OWN deadline first turns that into
 * a clean rejection → the route returns its graceful 500 → PrintButton falls back
 * to the print dialog. Keep it under the configured Netlify function timeout.
 */
export async function renderUrlToPdf(
  url: string | (() => string | Promise<string>),
  { timeoutMs = 24000 }: { timeoutMs?: number } = {},
): Promise<Buffer> {
  const puppeteer = (await import('puppeteer-core')).default
  const localChrome = findChrome()

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined

  const render = (async (): Promise<Buffer> => {
    // Prefer a system browser in dev; fall back to the bundled serverless binary.
    const launchOptions = localChrome
      ? {
          executablePath: localChrome,
          headless: true as const,
          args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
        }
      : await (async () => {
          const chromium = (await import('@sparticuz/chromium-min')).default
          // The report is inline SVG/HTML — no WebGL — so skip the graphics stack
          // (avoids extracting swiftshader, trimming serverless cold-start).
          chromium.setGraphicsMode = false
          return {
            executablePath: await chromium.executablePath(CHROMIUM_PACK_URL),
            headless: true as const,
            args: chromium.args,
          }
        })()

    browser = await puppeteer.launch(launchOptions)
    const page = await browser.newPage()
    // Resolve the target now (post-launch) so a token thunk is minted fresh.
    const target = typeof url === 'function' ? await url() : url
    // `load` fires deterministically once the document + its eager <img> tags are
    // fetched. `networkidle0` (the old setting) waits for 500ms of *zero* network
    // activity, which an image-heavy page on warm Supabase connections can fail to
    // reach — it then hit the timeout and 500'd. After `load`, explicitly await
    // every image's decode so no photo paints half-drawn in the PDF (the report's
    // <img> are eager, so decode resolves promptly; failures are swallowed so one
    // broken signed URL can't abort the whole render).
    await page.goto(target, { waitUntil: 'load', timeout: timeoutMs })
    await page.evaluate(async () => {
      const imgs = Array.from(document.images)
      // Defeat loading="lazy" for the one-shot render: force eager and ensure each
      // image has actually loaded (not just that the load event fired), so no photo
      // paints blank in the PDF.
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
    return Buffer.from(pdf)
  })()

  // Swallow a late rejection on the losing promise so racing it can't raise an
  // unhandled-rejection warning after we've already returned/thrown.
  render.catch(() => {})

  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`PDF render exceeded ${timeoutMs}ms`)), timeoutMs)
  })

  try {
    return await Promise.race([render, deadline])
  } finally {
    if (timer) clearTimeout(timer)
    if (browser) await browser.close().catch(() => {})
  }
}
