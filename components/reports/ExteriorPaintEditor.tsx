'use client'

import type { ChecklistItemState, PaintCondition } from '@/lib/report-types'
import { PAINT_PANELS, PAINT_OPTIONS, PAINT_SHORT, PAINT_HEX } from '@/lib/issues'
import { cn } from '@/lib/utils'

type PaintState = Record<string, ChecklistItemState>

/**
 * Per-panel paint condition map (brief section B). Not scored — purely records
 * Original / Cosmetic / Re-Painted / Faded for the customer's colour-coded
 * diagram. Stored under the reserved `exterior-paint` checklist key.
 */
export function ExteriorPaintEditor({
  state,
  onChange,
}: {
  state: PaintState
  onChange: (panelId: string, condition: PaintCondition) => void
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-text-secondary">
        Mark the paint condition for each panel. This builds the colour-coded paint map in the report.
      </p>
      <div className="space-y-1.5">
        {PAINT_PANELS.map((panel) => {
          const current = state[panel.id]?.paint
          return (
            <div
              key={panel.id}
              className="flex flex-col gap-1.5 rounded-input border border-border bg-surface p-2.5 xs:flex-row xs:items-center xs:justify-between"
            >
              <span className="text-sm font-medium text-text-primary">{panel.label}</span>
              <div className="grid grid-cols-4 gap-1.5 xs:flex">
                {PAINT_OPTIONS.map((opt) => {
                  const active = current === opt
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => onChange(panel.id, opt)}
                      style={active ? { backgroundColor: PAINT_HEX[opt], borderColor: PAINT_HEX[opt] } : undefined}
                      className={cn(
                        'min-h-[40px] rounded-input border px-2 text-xs font-semibold transition-colors',
                        active
                          ? 'text-black'
                          : 'border-border bg-card text-text-secondary hover:border-border-hover',
                      )}
                    >
                      {PAINT_SHORT[opt]}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
