'use client'

import { useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * "Polish with AI" — sends the current note/comment to /api/polish-comment, which
 * rewrites it into clean professional English without changing its meaning, then
 * hands the result back via onPolished. Disabled while empty or in-flight.
 */
export function PolishButton({
  text,
  onPolished,
  className,
}: {
  text: string
  onPolished: (polished: string) => void
  className?: string
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const empty = text.trim().length === 0

  async function polish() {
    if (empty || loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/polish-comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const data = (await res.json().catch(() => null)) as
        | { text?: string; error?: string }
        | null
      if (!res.ok || !data?.text) {
        throw new Error(data?.error || 'Could not polish the note. Please try again.')
      }
      onPolished(data.text)
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
        onClick={polish}
        disabled={empty || loading}
        title={empty ? 'Write a note first, then polish it with AI' : 'Rewrite in professional English'}
        className={cn(
          'inline-flex items-center gap-1 text-xs font-medium text-accent transition-colors hover:text-accent-hover disabled:cursor-not-allowed disabled:opacity-40',
          className,
        )}
      >
        {loading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
        {loading ? 'Polishing…' : 'Polish with AI'}
      </button>
    </span>
  )
}
