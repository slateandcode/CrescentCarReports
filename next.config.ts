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
  // (they ship native/binary assets) and make sure the serverless Chromium
  // binary is traced into the PDF route's function on deploy.
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
  outputFileTracingIncludes: {
    '/reports/[id]/pdf': ['./node_modules/@sparticuz/chromium/**'],
  },
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
