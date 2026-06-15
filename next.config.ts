import type { NextConfig } from 'next'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
}

export default nextConfig
