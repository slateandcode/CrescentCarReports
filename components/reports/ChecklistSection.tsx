'use client'

import { memo } from 'react'
import { ClipboardCheck, Info } from 'lucide-react'
import type { SectionDef, ChecklistItemDef } from '@/lib/report-templates'
import type { ChecklistItemState, ChecklistStatus, PaintCondition } from '@/lib/report-types'
import { effectiveStatus, sectionScore, paintDeductionsFor } from '@/lib/report-utils'
import { commonIssuesForItem, PAINT_PANELS } from '@/lib/issues'
import { SectionAccordion } from './SectionAccordion'
import { ChecklistItemCard } from './ChecklistItemCard'
import { ExteriorPaintEditor } from './ExteriorPaintEditor'

type SectionState = Record<string, ChecklistItemState>

const TYRE_IDS = new Set(['tyre-fl', 'tyre-fr', 'tyre-rl', 'tyre-rr'])

/** Stable empty-state reference so an untouched item's `state` prop keeps the same
 *  identity across renders — lets the memoized ChecklistItemCard skip re-rendering. */
const EMPTY_ITEM_STATE: ChecklistItemState = {}

/** Stable empty paint-state for the exterior badge when no panel has been touched. */
const EMPTY_PAINT_STATE: SectionState = {}

/** Mini status tally + section score rendered in the accordion header. */
function SectionHeaderBadge({
  state,
  sectionId,
  items,
  scored,
  paintState,
  paintDeduction = 0,
}: {
  state: SectionState
  sectionId: string
  /** Current template items — count only these, never orphaned stored keys. */
  items: ChecklistItemDef[]
  scored: boolean
  /** Exterior only: per-panel paint state. The 13 paint panels render in this same
   *  section (the paint map), so they're tallied here too — not just the issue items. */
  paintState?: SectionState
  /** Exterior only: extra deduction from non-original paint panels. */
  paintDeduction?: number
}) {
  const tally: Record<ChecklistStatus, number> = { pass: 0, minor: 0, major: 0, na: 0 }
  let done = 0
  let total = items.length
  // Default-pass (brief item 4/8): untouched items count as Pass, so the header
  // reads e.g. "13/13" by default and the inspector only changes what fails.
  for (const item of items) {
    tally[effectiveStatus(state[item.id])] += 1
    done += 1
  }
  // Exterior: the 13 paint panels are checked points too, so count them alongside
  // the issue items — an untouched panel is Original (a Pass), anything else a Minor.
  // This makes the header read 17/17 instead of 4/4, matching the overall total
  // (computeCounts already includes the 13 panels in the report-wide count).
  if (paintState) {
    for (const panel of PAINT_PANELS) {
      const paint = paintState[panel.id]?.paint ?? 'original'
      if (paint === 'original') tally.pass += 1
      else tally.minor += 1
      done += 1
      total += 1
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
        {done}/{total}
      </span>
    </span>
  )
}

export const ChecklistSection = memo(function ChecklistSection({
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
  // Receives sectionId so the parent can pass ONE stable callback (setItem) for
  // every section — keeping this prop's identity stable lets React.memo skip
  // unchanged sections.
  onItemChange: (
    sectionId: string,
    itemId: string,
    next: ChecklistItemState | ((prev: ChecklistItemState) => ChecklistItemState),
  ) => void
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
          paintState={isExterior ? (paintState ?? EMPTY_PAINT_STATE) : undefined}
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
              state={state[item.id] ?? EMPTY_ITEM_STATE}
              onItemChange={onItemChange}
              commonIssues={commonIssuesForItem(section.id, item.id)}
              tyre={isTyres && TYRE_IDS.has(item.id)}
              accident={isAccident}
            />
          ))}
        </div>
      </div>
    </SectionAccordion>
  )
})
