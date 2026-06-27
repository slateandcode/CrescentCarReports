'use client'

import { useState } from 'react'
import { Loader2, Wand2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * "Generate AI Summary" — asks /api/generate-summary to write the final Inspector
 * Summary from the report's saved inspection data (vehicle, score, findings,
 * recommendation) and hands it back via onGenerated to populate the editable box.
 * The inspector always reviews/edits before completing — it never sends anything
 * automatically (brief item 10).
 */
export function GenerateSummaryButton({
  reportId,
  onFlush,
  onGenerated,
  className,
}: {
  reportId: string
  /** Persist pending editor edits first — the API drafts from server-side data, so
   *  without this a finding entered within the autosave window is silently omitted. */
  onFlush?: () => Promise<void>
  onGenerated: (summary: string) => void
  className?: string
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      // Flush unsaved edits so the summary reflects what's on screen, not the last
      // autosaved snapshot (mirrors the Preview/Complete flush-before-action pattern).
      await onFlush?.()
      const res = await fetch('/api/generate-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId }),
      })
      const data = (await res.json().catch(() => null)) as
        | { text?: string; error?: string }
        | null
      if (!res.ok || !data?.text) {
        throw new Error(data?.error || 'Could not generate the summary. Please try again.')
      }
      onGenerated(data.text)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      {error && <span className="text-xs text-fail">{error}</span>}
      <button
        type="button"
        onClick={generate}
        disabled={loading}
        title="Draft the Inspector Summary from the inspection data"
        className={cn(
          'inline-flex items-center gap-1 text-xs font-semibold text-accent transition-colors hover:text-accent-hover disabled:cursor-not-allowed disabled:opacity-40',
          className,
        )}
      >
        {loading ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
        {loading ? 'Generating…' : 'Generate AI Summary'}
      </button>
    </span>
  )
}
