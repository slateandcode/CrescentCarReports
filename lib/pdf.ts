import 'server-only'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Server-side PDF rendering by driving a locally-installed Chrome/Edge in
 * headless print mode. This produces a true A4, edge-to-edge PDF every time —
 * independent of the user's browser print dialog (paper size, margins,
 * headers/footers), which is what makes `window.print()` output inconsistent.
 *
 * Works wherever a Chromium binary exists (local dev, or a server with
 * `CHROME_PATH` set). On hosts without one (e.g. plain serverless), the caller
 * should fall back to browser print.
 *
 * NOTE: `next build` prints a harmless Turbopack NFT warning ("the whole project
 * was traced unintentionally") for the PDF route because of the runtime fs/spawn
 * calls below, which the tracer can't statically scope. It does not affect the
 * build (which succeeds) or the route, and the deploy doesn't use standalone
 * output so the over-trace is inert. turbopackIgnore comments don't suppress it;
 * a broad outputFileTracingExcludes would risk stripping the function's real deps.
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

export function findChrome(): string | null {
  for (const p of CHROME_CANDIDATES) {
    if (existsSync(p)) return p
  }
  return null
}

/** Render a URL to a PDF buffer via headless Chrome. Throws if no binary. */
export async function renderUrlToPdf(url: string): Promise<Buffer> {
  const chrome = findChrome()
  if (!chrome) throw new Error('No Chrome/Edge binary found for server-side PDF rendering.')

  const dir = await mkdtemp(join(tmpdir(), 'ccr-pdf-'))
  const out = join(dir, 'report.pdf')
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    `--user-data-dir=${join(dir, 'profile')}`,
    '--no-pdf-header-footer',
    '--run-all-compositor-stages-before-draw',
    '--virtual-time-budget=15000',
    `--print-to-pdf=${out}`,
    url,
  ]

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(chrome, args, { stdio: 'ignore' })
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        reject(new Error('PDF render timed out'))
      }, 45000)
      child.on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
      child.on('exit', (code) => {
        clearTimeout(timer)
        // Chrome can exit non-zero yet still write the file — trust the file.
        if (existsSync(out)) resolve()
        else reject(new Error(`Chrome exited with code ${code} and produced no PDF.`))
      })
    })
    return await readFile(out)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
