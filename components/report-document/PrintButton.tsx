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

  async function downloadPdf() {
    if (isAppleMobile()) {
      window.location.href = pdfUrl
      return
    }
    setBusy(true)
    try {
      const res = await fetch(pdfUrl, { cache: 'no-store' })
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
      // Server render unavailable — fall back to the browser print dialog.
      setFallback(true)
      window.print()
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={fallback ? () => window.print() : downloadPdf}
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
