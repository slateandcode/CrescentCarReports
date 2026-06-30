'use client'

import { useState } from 'react'
import { Download, Loader2, Printer } from 'lucide-react'

/**
 * Primary export: a server-rendered A4 PDF (reliable dimensions regardless of
 * the browser print dialog). If that fails — e.g. the host has no Chrome binary
 * — it falls back to the browser's own print/save dialog.
 */
export function PrintButton({
  reportId,
  className,
  label = 'Download PDF',
  busyLabel = 'Generating…',
  fallbackLabel = 'Print / Save PDF',
}: {
  reportId: string
  className?: string
  label?: string
  busyLabel?: string
  fallbackLabel?: string
}) {
  const [busy, setBusy] = useState(false)
  const [fallback, setFallback] = useState(false)

  // The route 302-redirects to a short-lived signed Supabase URL for the file
  // (the bytes never stream back through the Netlify function — that overflowed
  // the ~6 MB function-response limit on big reports and crashed it). `?download=1`
  // makes Supabase serve it as an attachment for desktop; iOS omits it so the PDF
  // opens inline in Safari's viewer.
  const inlineUrl = `/reports/${reportId}/pdf`
  const downloadUrl = `/reports/${reportId}/pdf?download=1`
  // Cap the probe so a slow/stuck serverless cold-start can't spin forever — the
  // "download just spins on phone" report. Generous enough for a real cold start
  // (which maxDuration on the route covers), then we fall back.
  const PROBE_TIMEOUT_MS = 40000

  // iOS Safari (incl. iPadOS, which reports as "MacIntel" + touch) ignores the
  // <a download> attribute and won't save a blob: URL, so the blob path below
  // silently does nothing on a phone. There we navigate straight to the server
  // route instead — iOS opens the PDF in its viewer with Share → Save / WhatsApp.
  function isAppleMobile() {
    if (typeof navigator === 'undefined') return false
    return (
      /iP(hone|ad|od)/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    )
  }

  async function fetchWithTimeout(url: string, init?: RequestInit) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS)
    try {
      return await fetch(url, { cache: 'no-store', signal: ctrl.signal, ...init })
    } finally {
      clearTimeout(timer)
    }
  }

  // Probe the route WITHOUT downloading the file: `redirect: 'manual'` stops at
  // the 302, so we confirm the server can serve the PDF (and, on a cache miss,
  // warm the render) without pulling ~26 MB over mobile data just to check. A 302
  // surfaces as an opaqueredirect response (ok=false, type='opaqueredirect'); a
  // real failure (render 500 / 404) comes back as a normal non-ok response.
  async function probeOk(url: string): Promise<boolean> {
    const res = await fetchWithTimeout(url, { redirect: 'manual' })
    return res.type === 'opaqueredirect' || res.ok
  }

  // Fallback when the server PDF is unavailable: print the CLEAN, paginated report
  // document — never the editor form. window.print() on the editor (the reported
  // "it just prints the editor page" bug) is replaced by navigating to the bare
  // preview surface with ?print=1, which auto-opens the print dialog there.
  function fallbackPrint() {
    if (typeof window === 'undefined') return
    if (window.location.pathname.includes(`/reports/${reportId}/preview`)) {
      window.print()
    } else {
      window.location.href = `/reports/${reportId}/preview?print=1`
    }
  }

  async function downloadPdf() {
    // iOS opens the PDF inline in its viewer (Share → Save / WhatsApp); desktop
    // gets the attachment URL so the browser saves it to disk. Either way we just
    // navigate and let the browser follow the route's 302 to the signed Supabase
    // URL — no blob, no cross-origin body read. Probe first (manual redirect, so we
    // don't pull the file twice) so a server-render failure falls back to the clean
    // print path instead of dropping the user on a raw error page; the probe also
    // warms a cache-miss render, so the hand-off navigation hits the cached copy.
    const target = isAppleMobile() ? inlineUrl : downloadUrl
    setBusy(true)
    try {
      if (!(await probeOk(target))) throw new Error('PDF unavailable')
      window.location.href = target
    } catch {
      // Server render unavailable — fall back to printing the clean report.
      setFallback(true)
      fallbackPrint()
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={fallback ? fallbackPrint : downloadPdf}
      disabled={busy}
      className={className ?? 'btn-primary'}
      title={fallback ? 'Open the browser print dialog' : 'Download a print-ready A4 PDF'}
    >
      {busy ? (
        <Loader2 size={16} className="animate-spin" />
      ) : fallback ? (
        <Printer size={16} />
      ) : (
        <Download size={16} />
      )}
      {busy ? busyLabel : fallback ? fallbackLabel : label}
    </button>
  )
}
