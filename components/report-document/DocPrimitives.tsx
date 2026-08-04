import { Globe } from 'lucide-react'
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
    // loading="lazy" defers off-screen photos on the on-screen preview (a report
    // with many photos otherwise fires a big network waterfall on open). It is
    // SAFE for the PDF: Chromium's print path force-loads native lazy images
    // (unlike next/image's JS IntersectionObserver lazy, which caused the old
    // blank-PDF-image bug), and lib/pdf.ts additionally forces eager + awaits load
    // before page.pdf(). decoding="async" keeps decode off the critical path.
    // eslint-disable-next-line @next/next/no-img-element -- intentional bare <img> for the print/PDF surface; see DocImg doc above.
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={cn('absolute inset-0 h-full w-full', className)}
      style={style}
    />
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
      {/* brand-only: the crescent watermark disappears in white-label mode (and
          in Alpha's, which brings its own mark below). */}
      {watermark && (
        <span className="brand-only pointer-events-none absolute -bottom-10 -right-10 block h-64 w-64 opacity-[0.035]">
          <DocImg src="/crescent-mark-tight.png" className="object-contain" />
        </span>
      )}
      {watermark && (
        <span className="alpha-only pointer-events-none absolute -bottom-8 -right-12 block h-60 w-60 opacity-[0.05]">
          <DocImg src="/alpha-mark.png" className="object-contain" />
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

/**
 * Slim running header, one per brand.
 *
 * This component never receives the report — it is called from a dozen page
 * components that only know their own label — so which variant shows rides on
 * CSS classes set by the document root (see globals.css): `not-alpha` for the
 * near-black Crescent bar (which also serves white-label, with the wordmark
 * swapped for a neutral title), `alpha-only` for the Alpha Worldwide bar.
 *
 * The two variants are NOT the same height: Alpha's stacked chevron-over-
 * wordmark lockup is illegible squeezed into Crescent's 16mm band, so their
 * band is ~30mm, per the artwork. That difference is paid for in the pagination
 * budget (ALPHA_HEADER_EXTRA_MM in lib/report-paginate.ts) — the sheet is a
 * fixed 297mm that clips, so the content budget has to shrink by exactly what
 * the header grows, or dense pages shear instead of flowing to a
 * "(continued)" page.
 */
export function DocHeader({ label }: { label: string }) {
  return (
    <>
      <div className="not-alpha bg-doc-ink">
        <div className="flex items-center justify-between px-12 pb-4 pt-5">
          <Wordmark className="brand-only h-[26px] w-[132px]" />
          <span className="unbranded-only text-[11px] font-bold uppercase tracking-[0.3em] text-white/85">
            Vehicle Inspection Report
          </span>
          <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-white/55">
            {label}
            <span className="h-1 w-1 rounded-full bg-accent" />
          </span>
        </div>
        <div className="h-[3px] w-full bg-gradient-to-r from-accent via-accent to-accent/0" />
      </div>

      <AlphaHeader label={label} />
    </>
  )
}

/**
 * Alpha Worldwide running header: logo on the white end of a left-to-right wash
 * into their blue, page label riding the saturated end.
 *
 * Every number here is measured off the artwork they supplied: a 116px band
 * (30.7mm), an 82px lockup (21.6mm) sitting 16px down, and a gradient that runs
 * all the way to a deep royal #075ca6 rather than stopping at their light blue.
 *
 * `-mb-3` is the trick that lets the band be that tall. It pulls the following
 * content wrapper up 12px, so the band COSTS 104px of layout while PAINTING
 * 116px — the overlap falls entirely inside that wrapper's empty pt-9 padding,
 * so nothing is covered. Without it the taller band pushed the hand-laid
 * Exterior page (whose lead cannot reflow) past the 297mm sheet, and .report-page
 * clips rather than growing.
 */
function AlphaHeader({ label }: { label: string }) {
  return (
    <div className="alpha-only -mb-3">
      <div
        className="relative flex items-center justify-between overflow-hidden px-12 pb-[14px] pt-[16px]"
        style={{
          background:
            'linear-gradient(90deg, #ffffff 6%, #f0f6fb 20%, #dbeaf8 30%, #c0dbf6 40%, #98c5f0 50%, #6faeec 60%, #4495e6 70%, #2380df 80%, #0c70d4 90%, #075ca6 100%)',
        }}
      >
        {/* Their mark, ghosted into the blue end — the same quiet signature the
            crescent watermark gives a Crescent page. Box carries the asset's own
            201 × 207 aspect and the image is object-contain: the arrow must not
            be squeezed narrow here either (Alpha's amendment was "repeat for
            every page"). The band clips whatever falls outside it. */}
        <span className="pointer-events-none absolute -top-[16px] right-20 block h-[148px] w-[144px] opacity-[0.13]">
          <DocImg src="/alpha-mark.png" className="object-contain" />
        </span>
        <span className="relative block h-[82px] w-[192px]">
          <DocImg src="/alpha-worldwide.png" alt="Alpha Worldwide" className="object-contain object-left" />
        </span>
        <span className="relative flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.28em] text-white">
          {label}
          <span className="h-1 w-1 rounded-full bg-white" />
        </span>
      </div>
      {/* The rule is a gradient too — navy under the logo, brightening with the
          band above it. */}
      <div
        className="h-[4px] w-full"
        style={{ background: `linear-gradient(90deg, ${ALPHA_NAVY} 0%, #0e60b6 40%, #2c8ae6 80%, #1e7ac9 100%)` }}
      />
    </div>
  )
}

/** Alpha Worldwide dark navy — the steady half of their two-blue palette. */
export const ALPHA_NAVY = '#103659'

/** Page footer. The brand line swaps by CSS class — same reasoning as DocHeader. */
export function DocFooter({ reference, note }: { reference: string; note?: string }) {
  return (
    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between border-t border-doc-border bg-white px-12 py-3 text-[10px] tracking-wide text-doc-muted">
      <span className="brand-only uppercase tracking-[0.18em]">Crescent Car Reports · by Crescent Car Check</span>
      <span className="unbranded-only uppercase tracking-[0.18em]">Vehicle Inspection Report</span>
      {/* The visibility class must sit on its OWN element: `.alpha-only` toggles
          with `display: revert`, which on a <span> means `inline` — it would
          override an inline-flex on the same element and wrap the icon onto its
          own line. So the outer span switches, the inner one lays out. */}
      <span className="alpha-only">
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap normal-case tracking-normal text-doc-ink/70">
          <Globe size={11} className="text-accent" />
          https://alphaworldwide.me/
        </span>
      </span>
      {/* Crescent prints the page name and the report reference. Alpha drops the
          reference: "CCR" is Crescent Car Reports, so the code is brand leakage
          on their document however neutral the rest of the page is. The report
          is still identified by the Reference row on the Vehicle Summary page. */}
      <span className="not-alpha tnum font-mono text-doc-ink/70">
        {note ? `${note} · ` : ''}
        {reference}
      </span>
      <span className="alpha-only text-doc-ink/70">{note}</span>
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
