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
  reference,
  className,
  label = 'Download PDF',
  busyLabel = 'Generating…',
  fallbackLabel = 'Print / Save PDF',
}: {
  reportId: string
  reference: string
  className?: string
  label?: string
  busyLabel?: string
  fallbackLabel?: string
}) {
  const [busy, setBusy] = useState(false)
  const [fallback, setFallback] = useState(false)

  const pdfUrl = `/reports/${reportId}/pdf`
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

  async function fetchWithTimeout(url: string) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS)
    try {
      return await fetch(url, { cache: 'no-store', signal: ctrl.signal })
    } finally {
      clearTimeout(timer)
    }
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
    if (isAppleMobile()) {
      // iOS opens the inline PDF route in its viewer (Share → Save / WhatsApp),
      // which a blob: URL can't replicate here. Probe the route first so a
      // server-render failure falls back to the clean print path instead of
      // dropping the user on a raw 500 error page. The probe warms the function,
      // so the hand-off navigation re-renders on a warm lambda (no second cold start).
      setBusy(true)
      try {
        const res = await fetchWithTimeout(pdfUrl)
        if (!res.ok) throw new Error('PDF unavailable')
        window.location.href = pdfUrl
      } catch {
        setFallback(true)
        fallbackPrint()
      } finally {
        setBusy(false)
      }
      return
    }
    setBusy(true)
    try {
      const res = await fetchWithTimeout(pdfUrl)
      if (!res.ok) throw new Error(await res.text().catch(() => 'PDF generation failed'))
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${reference || 'inspection-report'}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
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
