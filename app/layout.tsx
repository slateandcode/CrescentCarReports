import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  )
}
