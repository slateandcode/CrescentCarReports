'use client'

import { Sparkles } from 'lucide-react'
import type { BuyerRecommendation } from '@/lib/report-types'
import { RECOMMENDATION_LABEL } from '@/lib/report-utils'
import { cn } from '@/lib/utils'

const RECOMMENDATION_OPTIONS: { value: BuyerRecommendation; active: string }[] = [
  { value: 'buy', active: 'bg-pass text-black border-pass' },
  { value: 'negotiate', active: 'bg-attention text-black border-attention' },
  { value: 'avoid', active: 'bg-fail text-white border-fail' },
]

interface Patch {
  buyer_recommendation?: BuyerRecommendation
  inspector_summary?: string
  price_negotiation_notes?: string
}

export function FinalRecommendationForm({
  values,
  flags,
  score,
  suggested,
  onPatch,
}: {
  values: {
    buyer_recommendation: string | null
    inspector_summary: string | null
    price_negotiation_notes: string | null
  }
  flags: {
    recommendationEnabled: boolean
    negotiationNotesEnabled: boolean
  }
  score: number | null
  suggested: BuyerRecommendation | null
  onPatch: (p: Patch) => void
}) {
  return (
    <div className="space-y-5">
      {flags.recommendationEnabled && (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="label-base !mb-0">Buyer recommendation</p>
            {suggested && (
              <button
                type="button"
                onClick={() => onPatch({ buyer_recommendation: suggested })}
                className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-hover"
              >
                <Sparkles size={12} />
                Suggested: {RECOMMENDATION_LABEL[suggested]}
                {score != null ? ` (${score}/100)` : ''}
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {RECOMMENDATION_OPTIONS.map((o) => {
              const active = values.buyer_recommendation === o.value
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => onPatch({ buyer_recommendation: o.value })}
                  className={cn(
                    'min-h-[44px] rounded-input border text-sm font-semibold transition-colors',
                    active ? o.active : 'border-border bg-surface text-text-secondary hover:border-border-hover',
                  )}
                >
                  {RECOMMENDATION_LABEL[o.value]}
                </button>
              )
            })}
          </div>
          <p className="mt-1.5 text-xs text-text-muted">
            System suggests from the Crescent Score (85+ Buy · 65–84 Negotiate · below 65 Avoid). You can override.
          </p>
        </div>
      )}

      <label className="block">
        <span className="label-base">Inspector notes</span>
        <textarea
          value={values.inspector_summary ?? ''}
          onChange={(e) => onPatch({ inspector_summary: e.target.value })}
          placeholder="Overall comment for the buyer — anything that doesn't fit the tick-boxes…"
          className="input-base min-h-[120px] resize-y"
        />
      </label>

      {flags.negotiationNotesEnabled && (
        <label className="block">
          <span className="label-base">
            Price negotiation notes
            <span className="font-normal normal-case text-text-muted"> (Premium)</span>
          </span>
          <textarea
            value={values.price_negotiation_notes ?? ''}
            onChange={(e) => onPatch({ price_negotiation_notes: e.target.value })}
            placeholder="Suggested negotiation points based on the findings…"
            className="input-base min-h-[88px] resize-y"
          />
        </label>
      )}

    </div>
  )
}
