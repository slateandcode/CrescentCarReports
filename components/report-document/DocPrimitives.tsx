import { cn } from '@/lib/utils'
import type {
  ChecklistStatus,
  OverallCondition,
  BuyerRecommendation,
} from '@/lib/report-types'
import { STATUS_LABEL, CONDITION_LABEL, RECOMMENDATION_LABEL } from '@/lib/report-utils'

/**
 * Plain <img> sized to fill its (positioned) parent — a print-safe stand-in for
 * next/image `fill`. The report is rendered to PDF by headless Chromium, where
 * next/image is an unnecessary failure surface: its client-side loader needs the
 * Next runtime to hydrate (which a strict dev CSP can stall), it lazy-loads
 * images below the fold (a one-shot print never scrolls them into view), and it
 * proxies every photo through the /_next/image optimizer (an extra fetch of each
 * signed Supabase URL on a serverless cold start). A bare <img> pointing at the
 * already-compressed / freshly-signed URL just loads — in the browser preview and
 * in the PDF alike. Mirrors `fill` via `absolute inset-0 h-full w-full`.
 */
export function DocImg({
  src,
  alt = '',
  className,
  style,
}: {
  src: string
  alt?: string
  className?: string
  style?: React.CSSProperties
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- intentional bare <img> for the print/PDF surface; see DocImg doc above.
    <img src={src} alt={alt} className={cn('absolute inset-0 h-full w-full', className)} style={style} />
  )
}

/** A single A4 page in the printable document. */
export function DocPage({
  children,
  className,
  watermark = false,
}: {
  children: React.ReactNode
  className?: string
  /** Faint crescent mark anchored bottom-right — calms sparse pages. */
  watermark?: boolean
}) {
  return (
    <div className={cn('report-page flex flex-col', className)}>
      {watermark && (
        <span className="pointer-events-none absolute -bottom-10 -right-10 block h-64 w-64 opacity-[0.035]">
          <DocImg src="/crescent-mark-tight.png" className="object-contain" />
        </span>
      )}
      {children}
    </div>
  )
}

/** The Crescent wordmark, tightly cropped, on a near-black field. */
function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('relative block', className)}>
      <DocImg src="/logo-wordmark.png" alt="Crescent Car Check" className="object-contain object-left" />
    </span>
  )
}

/** Slim near-black running header: wordmark left, page label right, gold rule. */
export function DocHeader({ label }: { label: string }) {
  return (
    <div className="bg-doc-ink">
      <div className="flex items-center justify-between px-12 pb-4 pt-5">
        <Wordmark className="h-[26px] w-[132px]" />
        <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-white/55">
          {label}
          <span className="h-1 w-1 rounded-full bg-accent" />
        </span>
      </div>
      <div className="h-[3px] w-full bg-gradient-to-r from-accent via-accent to-accent/0" />
    </div>
  )
}

export function DocFooter({ reference, note }: { reference: string; note?: string }) {
  return (
    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between border-t border-doc-border bg-white px-12 py-3 text-[10px] tracking-wide text-doc-muted">
      <span className="uppercase tracking-[0.18em]">Crescent Car Reports · by Crescent Car Check</span>
      <span className="tnum font-mono text-doc-ink/70">{note ? `${note} · ` : ''}{reference}</span>
    </div>
  )
}

/** Numbered section heading with a gold index — gives the document structure. */
export function DocSectionTitle({ index, children }: { index?: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-end gap-3 border-b border-doc-ink/15 pb-2">
      {index && <span className="tnum text-[26px] font-extrabold leading-none text-accent">{index}</span>}
      <h2 className="text-[15px] font-bold uppercase tracking-[0.14em] text-doc-ink">{children}</h2>
    </div>
  )
}

/** Label/value row for the detail grids — hairline divider, tracked label. */
export function DocField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="border-b border-doc-border py-2.5">
      <p className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-doc-muted">{label}</p>
      <p className="mt-1 text-[13px] font-medium text-doc-ink">{value || '—'}</p>
    </div>
  )
}

const DOC_STATUS_STYLES: Record<ChecklistStatus, string> = {
  pass: 'bg-pass/10 text-[#15803D] ring-pass/30',
  minor: 'bg-attention/12 text-[#B45309] ring-attention/30',
  major: 'bg-fail/10 text-[#B91C1C] ring-fail/30',
  na: 'bg-na/8 text-[#4B5563] ring-na/25',
}

const DOC_STATUS_DOT: Record<ChecklistStatus, string> = {
  pass: 'bg-pass',
  minor: 'bg-attention',
  major: 'bg-fail',
  na: 'bg-na',
}

export function DocStatusBadge({ status }: { status: ChecklistStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide ring-1 ring-inset',
        DOC_STATUS_STYLES[status],
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', DOC_STATUS_DOT[status])} />
      {STATUS_LABEL[status]}
    </span>
  )
}

const CONDITION_META: Record<OverallCondition, { ring: string; dot: string; text: string }> = {
  good: { ring: 'ring-pass/40', dot: 'bg-pass', text: 'text-[#15803D]' },
  caution: { ring: 'ring-attention/40', dot: 'bg-attention', text: 'text-[#B45309]' },
  high_risk: { ring: 'ring-fail/40', dot: 'bg-fail', text: 'text-[#B91C1C]' },
}

/** Premium verdict pill — outlined, not a flat button. */
export function ConditionBadge({ condition }: { condition: OverallCondition }) {
  const m = CONDITION_META[condition]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full bg-white px-4 py-1.5 text-sm font-bold ring-1 ring-inset',
        m.ring,
        m.text,
      )}
    >
      <span className={cn('h-2 w-2 rounded-full', m.dot)} />
      {CONDITION_LABEL[condition]}
    </span>
  )
}

const RECOMMENDATION_META: Record<BuyerRecommendation, { ring: string; dot: string; text: string }> = {
  buy: { ring: 'ring-pass/40', dot: 'bg-pass', text: 'text-[#15803D]' },
  negotiate: { ring: 'ring-attention/40', dot: 'bg-attention', text: 'text-[#B45309]' },
  avoid: { ring: 'ring-fail/40', dot: 'bg-fail', text: 'text-[#B91C1C]' },
}

export function RecommendationBadge({ recommendation }: { recommendation: BuyerRecommendation }) {
  const m = RECOMMENDATION_META[recommendation]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full bg-white px-4 py-1.5 text-sm font-bold ring-1 ring-inset',
        m.ring,
        m.text,
      )}
    >
      <span className={cn('h-2 w-2 rounded-full', m.dot)} />
      {RECOMMENDATION_LABEL[recommendation]}
    </span>
  )
}

/** Compact metric tile used across the verdict / summary pages. */
export function DocStat({
  label,
  value,
  tone,
  sub,
}: {
  label: string
  value: string
  tone?: 'fail' | 'attention' | 'pass'
  sub?: string
}) {
  const toneClass =
    tone === 'fail' ? 'text-fail' : tone === 'attention' ? 'text-[#B45309]' : tone === 'pass' ? 'text-[#15803D]' : 'text-doc-ink'
  return (
    <div className="rounded-lg border border-doc-border bg-doc-surface px-3.5 py-3">
      <p className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-doc-muted">{label}</p>
      <p className={cn('tnum mt-1 text-[19px] font-extrabold leading-none', toneClass)}>{value}</p>
      {sub && <p className="mt-1 text-[10px] text-doc-muted">{sub}</p>}
    </div>
  )
}
