import type { ReactNode } from 'react'
import type { ChecklistStatus, PaintCondition } from '@/lib/report-types'
import { PAINT_LABEL, PAINT_OPTIONS, PAINT_HEX } from '@/lib/issues'
import { SIDE_ART, TOP_ART, type ExteriorView } from './exterior-art'

/**
 * Schematic car diagrams for the printed report.
 *
 * The wheel layout (tyres page) stays a primitive-SVG schematic. The exterior
 * paint map renders the vector-traced blueprint (line-art) with each panel
 * segmented out of that drawing as its own fill region (see exterior-art.ts),
 * so every door, fender, quarter and bumper fills its true shape with its
 * paint-condition colour. Everything is inline SVG so it prints identically.
 */

const FILL: Record<ChecklistStatus, { fill: string; stroke: string; text: string }> = {
  pass: { fill: 'rgba(34,197,94,0.16)', stroke: '#22C55E', text: '#15803D' },
  minor: { fill: 'rgba(245,158,11,0.18)', stroke: '#F59E0B', text: '#B45309' },
  major: { fill: 'rgba(239,68,68,0.16)', stroke: '#EF4444', text: '#B91C1C' },
  na: { fill: 'rgba(107,114,128,0.12)', stroke: '#9CA3AF', text: '#4B5563' },
}
const NEUTRAL = { fill: '#F4F4F2', stroke: '#E0E0DC', text: '#9CA3AF' }
function zone(status?: ChecklistStatus) {
  return status ? FILL[status] : NEUTRAL
}

// ─── Wheel-position layout (tyres) ─────────────────────────────────────────
export type CornerStatuses = {
  fl?: ChecklistStatus
  fr?: ChecklistStatus
  rl?: ChecklistStatus
  rr?: ChecklistStatus
}

export function WheelLayout({ corners, size = 190 }: { corners: CornerStatuses; size?: number }) {
  const wheels: { key: keyof CornerStatuses; x: number; y: number; label: string }[] = [
    { key: 'fl', x: 26, y: 56, label: 'FL' },
    { key: 'fr', x: 152, y: 56, label: 'FR' },
    { key: 'rl', x: 26, y: 214, label: 'RL' },
    { key: 'rr', x: 152, y: 214, label: 'RR' },
  ]
  return (
    <svg width={size} height={size * 1.6} viewBox="0 0 200 320" className="shrink-0">
      {/* body */}
      <rect x="56" y="34" width="88" height="252" rx="34" fill="#F7F7F5" stroke="#E4E4E0" strokeWidth="2" />
      {/* windscreen + roof hints */}
      <rect x="66" y="70" width="68" height="34" rx="8" fill="#EDEDEA" />
      <rect x="64" y="150" width="72" height="86" rx="10" fill="#FFFFFF" stroke="#EDEDEA" strokeWidth="1.5" />
      <text x="100" y="26" textAnchor="middle" fontSize="9" fontWeight="700" fill="#9CA3AF" letterSpacing="1">
        FRONT
      </text>
      <text x="100" y="305" textAnchor="middle" fontSize="9" fontWeight="700" fill="#9CA3AF" letterSpacing="1">
        REAR
      </text>
      {wheels.map((w) => {
        const z = zone(corners[w.key])
        return (
          <g key={w.key}>
            <rect x={w.x} y={w.y} width="22" height="50" rx="7" fill={z.fill} stroke={z.stroke} strokeWidth="2" />
            <text x={w.x + 11} y={w.y + 30} textAnchor="middle" fontSize="11" fontWeight="800" fill={z.text}>
              {w.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ─── Exterior body map (traced blueprint + segmented panels) ───────────────
/** Per-panel paint conditions keyed by PAINT_PANELS ids. */
export type PaintMap = Record<string, PaintCondition | undefined>

const INK = '#2B2B29'
const WHEEL_CUT = '#ECECEA'

/** Semi-opaque fills so the traced line-art reads through the colour. */
const PANEL_FILL: Record<PaintCondition, string> = {
  original: 'rgba(34,197,94,0.60)',
  cosmetic: 'rgba(59,130,246,0.55)',
  repainted: 'rgba(245,158,11,0.62)',
  faded: 'rgba(168,85,247,0.55)',
}
/** Panels the inspector never marked — neutral grey, NOT green "original", so the
 *  map doesn't claim unchecked panels were verified original. */
const PANEL_NEUTRAL = 'rgba(148,163,184,0.22)'

function ExteriorViewSvg({
  view,
  paint,
  flipX,
  flipY,
  panelMap,
  svgClassName = 'h-auto w-full',
}: {
  view: ExteriorView
  paint: PaintMap
  /** Mirror horizontally (front ↔ rear). */
  flipX?: boolean
  /** Mirror vertically (roof ↔ underside) — used to "unfold" the left side below
   *  the top view, matching the client's layout. */
  flipY?: boolean
  /** Remap a view's panel-path id → the paint id to colour it with. Used to draw
   *  the right side from the (left-keyed) side art by pointing each left panel at
   *  its right-side paint condition. */
  panelMap?: Record<string, string>
  /** Override sizing — the report caps height so all views fit one A4 sheet. */
  svgClassName?: string
}) {
  const [, , width, height] = view.viewBox.split(' ').map(Number)
  const content = (
    <>
      {/* panel fills (each segmented from the drawing) */}
      {Object.entries(view.panels).map(([id, d]) => {
        const cond = paint[panelMap?.[id] ?? id]
        return <path key={id} d={d} fill={cond ? PANEL_FILL[cond] : PANEL_NEUTRAL} />
      })}
      {/* neutral wheels under the line-art */}
      {view.wheels?.map(([cx, cy, r], i) => <circle key={i} cx={cx} cy={cy} r={r} fill={WHEEL_CUT} />)}
      {/* traced line-art on top defines every edge */}
      <path d={view.line} fill={INK} fillRule="evenodd" />
    </>
  )
  const tx = flipX ? width : 0
  const ty = flipY ? height : 0
  const transform = flipX || flipY ? `translate(${tx},${ty}) scale(${flipX ? -1 : 1},${flipY ? -1 : 1})` : null
  return (
    <svg viewBox={view.viewBox} className={svgClassName} role="img">
      {transform ? <g transform={transform}>{content}</g> : content}
    </svg>
  )
}

function ViewFrame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col rounded-lg border border-doc-border bg-white px-2.5 py-2">
      <span className="mb-1 text-[8px] font-semibold uppercase tracking-[0.14em] text-doc-muted">{label}</span>
      <div className="flex flex-1 items-center justify-center">{children}</div>
    </div>
  )
}

/** The side art is keyed to the LEFT panels; to draw the right side we mirror the
 *  geometry (flipX) and point each left panel at its right-side paint condition.
 *  Front/rear bumpers are single (un-sided) panels, so they fall through to the
 *  identity lookup. */
const SIDE_RIGHT_MAP: Record<string, string> = {
  'front-left-fender': 'front-right-fender',
  'front-left-door': 'front-right-door',
  'rear-left-door': 'rear-right-door',
  'rear-left-quarter': 'rear-right-quarter',
}

/** Colour-coded exterior paint map laid out as the client's "unfold": right side
 *  on top, top-down in the middle, left side below — every view nosing the SAME
 *  way (right), so the three read as one car folded open.
 *
 *  • Right side = the side art (nose right), panels remapped to right-side paint.
 *  • Top view   = the top art mirrored horizontally (`flipX`). As authored the top
 *                 art noses LEFT with the car's RIGHT flank already on the top edge;
 *                 a single horizontal flip turns it nose-right (matching the side
 *                 views) while leaving the right flank on top — so every panel keeps
 *                 its own paint, no remap, and the line-art points the right way.
 *  • Left side  = the side art flipped vertically (unfolded downward).
 *
 *  All three are wide and short, so we cap their height to keep the whole exterior
 *  page on a single A4 sheet — otherwise the paint-condition list orphans onto
 *  page 2. */
export function ExteriorBodyMap({ paint }: { paint: PaintMap }) {
  const viewCls = 'h-[86px] w-auto max-w-full'
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-1.5">
      <ViewFrame label="Right side">
        <ExteriorViewSvg view={SIDE_ART} paint={paint} panelMap={SIDE_RIGHT_MAP} svgClassName={viewCls} />
      </ViewFrame>
      <ViewFrame label="Top view">
        <ExteriorViewSvg view={TOP_ART} paint={paint} flipX svgClassName={viewCls} />
      </ViewFrame>
      <ViewFrame label="Left side">
        <ExteriorViewSvg view={SIDE_ART} paint={paint} flipY svgClassName={viewCls} />
      </ViewFrame>
    </div>
  )
}

/** Status legend for the wheel diagram. */
export function DiagramLegend() {
  const rows: { label: string; color: string }[] = [
    { label: 'Pass', color: '#22C55E' },
    { label: 'Minor', color: '#F59E0B' },
    { label: 'Major', color: '#EF4444' },
    { label: 'Not checked', color: '#D4D4D0' },
  ]
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1.5">
      {rows.map((r) => (
        <span key={r.label} className="flex items-center gap-1.5 text-[11px] text-doc-muted">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: r.color }} />
          {r.label}
        </span>
      ))}
    </div>
  )
}

/** Paint-condition legend for the body map. */
export function PaintLegend() {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1.5">
      {PAINT_OPTIONS.map((opt) => (
        <span key={opt} className="flex items-center gap-1.5 text-[11px] text-doc-muted">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: PAINT_HEX[opt] }} />
          {PAINT_LABEL[opt]}
        </span>
      ))}
      <span className="flex items-center gap-1.5 text-[11px] text-doc-muted">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: '#D4D4D0' }} />
        Not assessed
      </span>
    </div>
  )
}
