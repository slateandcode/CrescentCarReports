import 'server-only'
import { existsSync } from 'node:fs'

/**
 * Server-side PDF rendering with headless Chromium via puppeteer-core.
 *
 * Two execution environments, auto-detected:
 *   • Local dev (Windows/Mac/Linux with a browser installed) — drives the
 *     locally-installed Chrome/Edge found by findChrome().
 *   • Serverless (Netlify functions, no system browser) — uses the bundled
 *     @sparticuz/chromium binary. This is what makes "Download PDF" work in
 *     production (and therefore on phones); previously the route 500'd on the
 *     host because no system Chrome existed, and the client fell back to
 *     window.print(), which fails on iOS Safari.
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

/** Render a URL to a PDF buffer via headless Chromium. */
export async function renderUrlToPdf(url: string): Promise<Buffer> {
  const puppeteer = (await import('puppeteer-core')).default
  const localChrome = findChrome()

  // Prefer a system browser in dev; fall back to the bundled serverless binary.
  const launchOptions = localChrome
    ? {
        executablePath: localChrome,
        headless: true,
        args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
      }
    : await (async () => {
        const chromium = (await import('@sparticuz/chromium')).default
        // The report is inline SVG/HTML — no WebGL — so skip the graphics stack
        // (avoids extracting swiftshader, trimming serverless cold-start).
        chromium.setGraphicsMode = false
        return {
          executablePath: await chromium.executablePath(),
          headless: true as const,
          args: chromium.args,
        }
      })()

  const browser = await puppeteer.launch(launchOptions)
  try {
    const page = await browser.newPage()
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 25000 })
    const pdf = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}
