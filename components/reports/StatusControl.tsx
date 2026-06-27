'use client'

import { cn } from '@/lib/utils'
import type { ChecklistStatus, Severity } from '@/lib/report-types'
import { STATUS_OPTIONS, STATUS_LABEL, SEVERITY_OPTIONS, SEVERITY_LABEL } from '@/lib/report-utils'

const ACTIVE_STYLES: Record<ChecklistStatus, string> = {
  pass: 'bg-pass text-black border-pass',
  minor: 'bg-attention text-black border-attention',
  major: 'bg-fail text-white border-fail',
  na: 'bg-na text-white border-na',
}

/** Pass / Minor Issue / Major Issue buttons, sized for one-handed phone use. */
export function StatusSegmentedControl({
  value,
  onChange,
}: {
  value?: ChecklistStatus
  onChange: (status: ChecklistStatus) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {STATUS_OPTIONS.map((status) => {
        // Default-pass (brief item 4): an untouched item shows Pass pre-selected.
        const active = (value ?? 'pass') === status
        return (
          <button
            key={status}
            type="button"
            onClick={() => onChange(status)}
            className={cn(
              'min-h-[44px] rounded-input border px-1 text-sm font-semibold transition-colors',
              active
                ? ACTIVE_STYLES[status]
                : 'border-border bg-surface text-text-secondary hover:border-border-hover hover:text-text-primary',
            )}
          >
            {STATUS_LABEL[status]}
          </button>
        )
      })}
    </div>
  )
}

const SEVERITY_ACTIVE: Record<Severity, string> = {
  minor: 'bg-attention/20 text-attention border-attention/50',
  moderate: 'bg-attention/30 text-attention border-attention/60',
  major: 'bg-fail/20 text-fail border-fail/50',
}

export function SeveritySelector({
  value,
  onChange,
}: {
  value?: Severity
  onChange: (s: Severity) => void
}) {
  return (
    <div className="flex gap-1.5">
      {SEVERITY_OPTIONS.map((s) => {
        const active = value === s
        return (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            className={cn(
              'min-h-[38px] flex-1 rounded-input border text-sm font-medium transition-colors',
              active
                ? SEVERITY_ACTIVE[s]
                : 'border-border bg-surface text-text-secondary hover:border-border-hover',
            )}
          >
            {SEVERITY_LABEL[s]}
          </button>
        )
      })}
    </div>
  )
}
