'use client'

import { ClipboardCheck, Info } from 'lucide-react'
import type { SectionDef, ChecklistItemDef } from '@/lib/report-templates'
import type { ChecklistItemState, ChecklistStatus, PaintCondition } from '@/lib/report-types'
import { itemStatus, sectionScore, paintDeductionsFor } from '@/lib/report-utils'
import { commonIssuesForItem } from '@/lib/issues'
import { SectionAccordion } from './SectionAccordion'
import { ChecklistItemCard } from './ChecklistItemCard'
import { ExteriorPaintEditor } from './ExteriorPaintEditor'

type SectionState = Record<string, ChecklistItemState>

const TYRE_IDS = new Set(['tyre-fl', 'tyre-fr', 'tyre-rl', 'tyre-rr'])

/** Mini status tally + section score rendered in the accordion header. */
function SectionHeaderBadge({
  state,
  sectionId,
  items,
  scored,
  paintDeduction = 0,
}: {
  state: SectionState
  sectionId: string
  /** Current template items — count only these, never orphaned stored keys. */
  items: ChecklistItemDef[]
  scored: boolean
  /** Exterior only: extra deduction from non-original paint panels. */
  paintDeduction?: number
}) {
  const tally: Record<ChecklistStatus, number> = { pass: 0, minor: 0, major: 0, na: 0 }
  let done = 0
  for (const item of items) {
    const st = itemStatus(state[item.id])
    if (st) {
      tally[st] += 1
      done += 1
    }
  }
  return (
    <span className="hidden items-center gap-2 text-xs font-medium xs:flex">
      {tally.major > 0 && <span className="text-fail">{tally.major} major</span>}
      {tally.minor > 0 && <span className="text-attention">{tally.minor} minor</span>}
      {scored && done > 0 && (
        <span className="font-semibold text-text-secondary">
          {Math.max(0, sectionScore(state, sectionId) - paintDeduction)}/100
        </span>
      )}
      <span className="text-text-muted">
        {done}/{items.length}
      </span>
    </span>
  )
}

export function ChecklistSection({
  reportId,
  section,
  state,
  onItemChange,
  paintState,
  onPaintChange,
}: {
  reportId: string
  section: SectionDef
  state: SectionState
  onItemChange: (itemId: string, next: ChecklistItemState) => void
  /** Exterior only: per-panel paint conditions + setter. */
  paintState?: SectionState
  onPaintChange?: (panelId: string, condition: PaintCondition) => void
}) {
  const isExterior = section.kind === 'exterior'
  const isTyres = section.kind === 'tyres'
  const isAccident = section.kind === 'accident'

  return (
    <SectionAccordion
      title={section.title}
      subtitle={section.description}
      icon={<ClipboardCheck size={18} />}
      badge={
        <SectionHeaderBadge
          state={state}
          sectionId={section.id}
          items={section.items}
          scored={Boolean(section.scored)}
          paintDeduction={isExterior ? paintDeductionsFor(paintState) : 0}
        />
      }
    >
      <div className="space-y-3">
        {section.kind === 'accident' && (
          <p className="flex items-start gap-2 rounded-input border border-border bg-surface p-2.5 text-xs text-text-secondary">
            <Info size={14} className="mt-0.5 shrink-0 text-accent" />
            No accident record found does not guarantee the car has never been in an accident — it only means
            no record was found in the sources checked.
          </p>
        )}

        {isExterior && paintState && onPaintChange && (
          <div className="rounded-input border border-border bg-card p-3">
            <p className="mb-2 text-sm font-semibold text-text-primary">Paint &amp; panel condition</p>
            <ExteriorPaintEditor state={paintState} onChange={onPaintChange} />
          </div>
        )}

        <div className="space-y-2.5">
          {section.items.map((item) => (
            <ChecklistItemCard
              key={item.id}
              reportId={reportId}
              sectionId={section.id}
              item={item}
              state={state[item.id] ?? {}}
              onChange={(next) => onItemChange(item.id, next)}
              commonIssues={commonIssuesForItem(section.id, item.id)}
              tyre={isTyres && TYRE_IDS.has(item.id)}
              accident={isAccident}
            />
          ))}
        </div>
      </div>
    </SectionAccordion>
  )
}
