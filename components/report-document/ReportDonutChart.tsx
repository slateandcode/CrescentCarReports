import type { ReportCounts } from '@/lib/report-types'
import { STATUS_HEX } from '@/lib/report-utils'

/**
 * Print-friendly SVG donut of pass/attention/fail/na. Pure SVG + strokes so it
 * renders identically on screen and in the printed PDF (no chart library).
 */
export function ReportDonutChart({ counts, size = 150 }: { counts: ReportCounts; size?: number }) {
  const segments = [
    { key: 'pass', value: counts.pass, color: STATUS_HEX.pass },
    { key: 'minor', value: counts.minor, color: STATUS_HEX.minor },
    { key: 'major', value: counts.major, color: STATUS_HEX.major },
    { key: 'na', value: counts.na, color: STATUS_HEX.na },
  ].filter((s) => s.value > 0)

  const totalGraded = counts.pass + counts.minor + counts.major + counts.na
  const radius = 60
  const circumference = 2 * Math.PI * radius
  const stroke = 20

  let offset = 0
  const arcs = segments.map((s) => {
    const fraction = totalGraded ? s.value / totalGraded : 0
    const dash = fraction * circumference
    const arc = {
      ...s,
      dasharray: `${dash} ${circumference - dash}`,
      dashoffset: -offset,
    }
    offset += dash
    return arc
  })

  return (
    <svg width={size} height={size} viewBox="0 0 160 160" className="shrink-0">
      <circle cx="80" cy="80" r={radius} fill="none" stroke="#EDEDEA" strokeWidth={stroke} />
      {arcs.map((a) => (
        <circle
          key={a.key}
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          stroke={a.color}
          strokeWidth={stroke}
          strokeLinecap="butt"
          strokeDasharray={a.dasharray}
          strokeDashoffset={a.dashoffset}
          transform="rotate(-90 80 80)"
        />
      ))}
      <text x="80" y="74" textAnchor="middle" fontSize="30" fontWeight="800" fill="#0A0A0A">
        {totalGraded}
      </text>
      <text x="80" y="95" textAnchor="middle" fontSize="11" fontWeight="600" fill="#6B6B6B" letterSpacing="0.5">
        checked
      </text>
    </svg>
  )
}

export function DonutLegend({ counts }: { counts: ReportCounts }) {
  const rows = [
    { label: 'Pass', value: counts.pass, color: STATUS_HEX.pass },
    { label: 'Minor issues', value: counts.minor, color: STATUS_HEX.minor },
    { label: 'Major issues', value: counts.major, color: STATUS_HEX.major },
    { label: 'N/A', value: counts.na, color: STATUS_HEX.na },
  ].filter((r) => r.value > 0 || r.label !== 'N/A')
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: r.color }} />
          <span className="text-[12px] text-doc-muted">{r.label}</span>
          <span className="tnum ml-auto text-[13px] font-bold text-doc-ink">{r.value}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * Headline health-score gauge: a 270° sweep that fills proportionally to the
 * score and shades green→amber→red by band. The hero element of the verdict
 * page.
 */
export function HealthGauge({
  score,
  size = 196,
  // "CRESCENT SCORE" is brand identity — white-label reports pass a neutral name.
  scoreLabel = 'CRESCENT SCORE',
}: {
  score: number | null
  size?: number
  scoreLabel?: string
}) {
  const radius = 64
  const circ = 2 * Math.PI * radius
  const sweep = 0.75 // 270° arc
  const pct = score == null ? 0 : Math.max(0, Math.min(100, score)) / 100
  const trackDash = `${circ * sweep} ${circ}`
  const valueDash = `${circ * sweep * pct} ${circ}`
  const color = score == null ? '#9CA3AF' : score >= 85 ? '#22C55E' : score >= 65 ? '#F59E0B' : '#EF4444'
  const band = score == null ? 'Not graded' : score >= 85 ? 'Strong' : score >= 65 ? 'Fair' : 'Weak'

  // Rotate so the 270° arc opens at the bottom (gap centred at 6 o'clock).
  const rotate = 135

  return (
    <svg width={size} height={size} viewBox="0 0 160 160" className="shrink-0">
      <g transform={`rotate(${rotate} 80 80)`}>
        <circle
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          stroke="#EDEDEA"
          strokeWidth={12}
          strokeLinecap="round"
          strokeDasharray={trackDash}
        />
        <circle
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={12}
          strokeLinecap="round"
          strokeDasharray={valueDash}
        />
      </g>
      <text x="80" y="78" textAnchor="middle" fontSize="42" fontWeight="800" fill="#0A0A0A">
        {score == null ? '—' : score}
      </text>
      <text x="80" y="98" textAnchor="middle" fontSize="10.5" fontWeight="700" fill={color} letterSpacing="1.5">
        {band.toUpperCase()}
      </text>
      <text x="80" y="113" textAnchor="middle" fontSize="8.5" fontWeight="600" fill="#9CA3AF" letterSpacing="1">
        {scoreLabel}
      </text>
    </svg>
  )
}
