import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { cookies } from 'next/headers'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  // True italics — the report cover headline is set in Inter Black Italic.
  style: ['normal', 'italic'],
})

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Crescent Car Reports'

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
  // Pinch-zoom intentionally left enabled — inspectors need to zoom into VINs,
  // plates and fine print in the field. (Inputs are forced to 16px on mobile in
  // globals.css, so there's no iOS zoom-on-focus to suppress.)
}

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} · by Crescent Car Check`,
    template: `%s · ${APP_NAME}`,
  },
  description: 'Inspection report software for Crescent Car Check.',
  robots: { index: false, follow: false },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Theme is persisted in a cookie so the server can render the right palette on
  // the first paint — no client boot script, no dark→light flash. Default: dark.
  const theme = (await cookies()).get('theme')?.value === 'light' ? 'light' : 'dark'
  return (
    <html lang="en" data-theme={theme} className={inter.variable}>
      <body>{children}</body>
    </html>
  )
}
