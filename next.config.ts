import type { NextConfig } from 'next'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : ''
const supabaseWs = supabaseOrigin ? supabaseOrigin.replace(/^https/, 'wss') : ''

// Content-Security-Policy for an internal, PII-handling dashboard. The teeth are
// `frame-ancestors 'none'` (clickjacking defence — also covers browsers that
// ignore X-Frame-Options) plus locking script/connect/img to self + this
// project's Supabase origin. 'unsafe-inline' stays on script/style because the
// App Router emits an inline hydration bootstrap and Tailwind/React inject inline
// styles; a nonce-based CSP is the follow-up. The dashboard loads no third-party
// scripts. img/connect include the Supabase host for storage (signed photo URLs),
// REST/auth and the realtime websocket.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob:${supabaseOrigin ? ' ' + supabaseOrigin : ''}`,
  "font-src 'self' data:",
  `connect-src 'self'${supabaseOrigin ? ' ' + supabaseOrigin + ' ' + supabaseWs : ''}`,
  'upgrade-insecure-requests',
].join('; ')

// Baseline security headers for every route. The dashboard renders customer PII
// and uses a deliberately non-httpOnly Supabase auth cookie, so clickjacking
// protection (X-Frame-Options/CSP) and HSTS are not optional.
const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  // 1 year HSTS, no `preload` (matches the public site — avoids committing the
  // domain to the irreversible browser preload list).
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
]

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Don't advertise the framework/version on every response.
  poweredByHeader: false,
  // Pin the workspace root to this project — a stray lockfile higher up the
  // filesystem otherwise makes Next infer the wrong root.
  turbopack: {
    root: process.cwd(),
  },
  // Headless-Chromium PDF rendering (lib/pdf.ts). Keep these out of the bundler
  // — they ship native code. The Chromium binary is no longer bundled at all:
  // @sparticuz/chromium-min fetches it from CHROMIUM_PACK_URL at runtime, so no
  // file-tracing is needed (the previous outputFileTracingIncludes approach
  // silently dropped the binary on Netlify).
  serverExternalPackages: ['@sparticuz/chromium-min', 'puppeteer-core'],
  images: {
    // Allow Supabase Storage public/signed image URLs to be optimised.
    remotePatterns: supabaseUrl
      ? [
          {
            protocol: 'https',
            hostname: new URL(supabaseUrl).hostname,
          },
        ]
      : [],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
