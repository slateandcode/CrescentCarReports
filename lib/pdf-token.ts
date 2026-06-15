import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Short-lived, HMAC-signed tokens that authorise ONE report's print view to be
 * rendered without a user session — used only so the server-side PDF generator
 * (headless Chrome, which has no auth cookie) can load `/reports/:id/preview`.
 *
 * The token is bound to a specific report id and expires in 5 minutes. The PDF
 * route mints it AFTER the (potentially slow, ~50MB) serverless Chromium
 * cold-start download, so the download can't consume the token's lifetime; the
 * window then comfortably covers page load + render. It is verified in the
 * (Node-runtime) render page; a missing/invalid/expired token simply falls back
 * to the normal signed-in auth check, so nothing is exposed.
 */

const TTL_MS = 5 * 60 * 1000

function secret(): string {
  // Prefer a dedicated PDF_TOKEN_SECRET (a random value owned by this app).
  // Falling back to SUPABASE_SERVICE_ROLE_KEY keeps unconfigured envs working,
  // but it couples token validity to the DB key: rotating that key would
  // silently invalidate every in-flight PDF token. Setting PDF_TOKEN_SECRET in
  // production decouples the two — see .env.example.
  const s = process.env.PDF_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!s) throw new Error('No secret available for PDF token signing.')
  return s
}

function sign(data: string): string {
  return createHmac('sha256', secret()).update(data).digest('base64url')
}

export function createPdfToken(reportId: string): string {
  const exp = Date.now() + TTL_MS
  return `${exp}.${sign(`${reportId}.${exp}`)}`
}

export function verifyPdfToken(token: string | null | undefined, reportId: string): boolean {
  if (!token) return false
  const dot = token.indexOf('.')
  if (dot <= 0) return false
  const expStr = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const exp = Number(expStr)
  if (!Number.isFinite(exp) || Date.now() > exp || !sig) return false
  try {
    const a = Buffer.from(sig)
    const b = Buffer.from(sign(`${reportId}.${exp}`))
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}
