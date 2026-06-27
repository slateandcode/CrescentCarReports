import { format } from 'date-fns'
import {
  Camera,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Gauge,
  Calendar,
  CalendarDays,
  Clock,
  MapPin,
  Hash,
  FileText,
  Fuel,
  Cog,
  Globe,
  Cylinder,
  Info,
  UserRound,
} from 'lucide-react'
import type {
  InspectionReport,
  ChecklistStatus,
  ChecklistItemState,
  PhotoRef,
} from '@/lib/report-types'
import type { ResolvedTemplate, SectionDef } from '@/lib/report-templates'
import { getTemplate } from '@/lib/report-templates'
import {
  computeCounts,
  sectionCounts,
  sectionScore,
  sectionScores,
  paintDeductionsFor,
  overallScore,
  recommendationFromScore,
  normalizeRecommendation,
  deriveAutoFindings,
  itemStatus,
  effectiveStatus,
  itemComment,
  itemNote,
  decodeDot,
  isIssue,
  vehicleTitle,
  RECOMMENDATION_LABEL,
  STATUS_LABEL,
  STATUS_HEX,
} from '@/lib/report-utils'
import {
  PAINT_SECTION_ID,
  PAINT_PANELS,
  PAINT_SHORT,
  PAINT_HEX,
} from '@/lib/issues'
import type { PaintCondition } from '@/lib/report-types'
import {
  DocPage,
  DocHeader,
  DocFooter,
  DocSectionTitle,
  DocField,
  DocStat,
  DocStatusBadge,
  RecommendationBadge,
  DocImg,
} from './DocPrimitives'
import { HealthGauge } from './ReportDonutChart'
import {
  WheelLayout,
  ExteriorBodyMap,
  DiagramLegend,
  PaintLegend,
  type CornerStatuses,
  type PaintMap,
} from './CarDiagrams'
import {
  buildSectionBlocks,
  paginateSectionBlocks,
  paginatePhotos,
  paginateNotes,
  splitChunk,
  SECTION_CONT_MM,
  type SectionBlock,
} from '@/lib/report-paginate'

// ════════════════════════════════════════════════════════════════════════
// Shared building blocks
// ════════════════════════════════════════════════════════════════════════

function MiniHeading({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`mb-3 flex items-center gap-2 ${className ?? ''}`}>
      <span className="h-[3px] w-6 rounded-full bg-accent" />
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-doc-ink">{children}</p>
    </div>
  )
}

function bandColor(score: number): string {
  return score >= 85 ? STATUS_HEX.pass : score >= 65 ? STATUS_HEX.minor : STATUS_HEX.major
}

/** Section score pill + tally shown at the top of each scored-section page. */
function SectionScoreHeader({
  report,
  sectionId,
  items,
}: {
  report: InspectionReport
  sectionId: string
  items: SectionDef['items']
}) {
  const checklist = report.checklist || {}
  const state = checklist[sectionId] || {}
  const score = sectionScore(state, sectionId)
  // Tally over THIS package's (tier-filtered) `items` so the numerator matches the
  // denominator (items.length). sectionCounts() iterates the full, tier-unfiltered
  // library, which over-counts premium-only items on a Standard report (e.g. it
  // would show an impossible "Checked 15/9"). Default-pass: untouched item = Pass.
  const tally: Record<ChecklistStatus, number> = { pass: 0, minor: 0, major: 0, na: 0 }
  for (const item of items) tally[effectiveStatus(state[item.id])] += 1
  const completed = tally.pass + tally.minor + tally.major + tally.na
  return (
    <div className="mb-5 flex items-stretch gap-3">
      <div
        className="flex flex-col justify-center rounded-xl px-5 py-3 text-white"
        style={{ backgroundColor: bandColor(score) }}
      >
        <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/80">Section score</p>
        <p className="tnum text-[24px] font-extrabold leading-none">
          {score}
          <span className="text-[13px] font-bold text-white/80">/100</span>
        </p>
      </div>
      <div className="flex flex-1 items-center gap-5 rounded-xl border border-doc-border bg-doc-surface px-5">
        <ScoreTally label="Checked" value={`${completed}/${items.length}`} />
        <ScoreTally label="Passed" value={`${tally.pass}`} tone="pass" />
        <ScoreTally label="Minor" value={`${tally.minor}`} tone="minor" />
        <ScoreTally label="Major" value={`${tally.major}`} tone="major" />
      </div>
    </div>
  )
}

function ScoreTally({ label, value, tone }: { label: string; value: string; tone?: 'pass' | 'minor' | 'major' }) {
  const cls =
    tone === 'pass' ? 'text-[#15803D]' : tone === 'minor' ? 'text-[#B45309]' : tone === 'major' ? 'text-[#B91C1C]' : 'text-doc-ink'
  return (
    <div>
      <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-doc-muted">{label}</p>
      <p className={`tnum mt-0.5 text-[17px] font-extrabold leading-none ${cls}`}>{value}</p>
    </div>
  )
}

/**
 * Evidence photos for a checklist item. Every photo renders (no silent cap) in a
 * consistent 4:3 frame; the inspector's per-photo `fit` choice decides whether it
 * crops to fill the frame (default) or shows the whole image letterboxed, and an
 * optional caption prints underneath.
 */
function ItemPhotos({ photos, alt }: { photos?: PhotoRef[]; alt: string }) {
  const list = photos ?? []
  if (list.length === 0) return null
  return (
    // avoid-break keeps a photo row from splitting across a page boundary (the
    // "photo cut in half" bug). Belt-and-braces with the chunker, which already
    // keeps a card whole on one page.
    <div className="avoid-break mt-2.5 flex flex-wrap gap-2">
      {list.map((p) => (
        <figure key={p.id} className="w-32">
          <div className="relative h-24 w-32 overflow-hidden rounded-lg border border-doc-border bg-doc-surface">
            <DocImg
              src={p.url}
              alt={p.caption || alt}
              className={p.fit === 'contain' ? 'object-contain' : 'object-cover'}
            />
          </div>
          {p.caption && (
            <figcaption className="mt-1 text-[9.5px] leading-snug text-doc-muted">{p.caption}</figcaption>
          )}
        </figure>
      ))}
    </div>
  )
}

/** A detailed card for a Minor / Major issue. */
function IssueCard({ title, state }: { title: string; state: ChecklistItemState }) {
  const status = itemStatus(state) as ChecklistStatus
  const major = status === 'major'
  const comment = itemComment(state)
  const note = itemNote(state)
  const issues = state.commonIssues ?? []
  return (
    <div className={`avoid-break rounded-xl border-l-[3px] bg-doc-surface p-4 ${major ? 'border-fail' : 'border-attention'}`}>
      <div className="flex items-start gap-3.5">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${major ? 'bg-fail/12' : 'bg-attention/12'}`}>
          <AlertTriangle size={18} className={major ? 'text-fail' : 'text-attention'} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold text-doc-ink">{title}</p>
            <DocStatusBadge status={status} />
          </div>
          {state.affectedArea && (
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-doc-muted">
              Affected area · {state.affectedArea}
            </p>
          )}
          {issues.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {issues.map((i) => (
                <span key={i} className="rounded-full bg-doc-ink/[0.05] px-2 py-0.5 text-[10px] font-medium text-doc-ink">
                  {i}
                </span>
              ))}
            </div>
          )}
          {comment && <p className="mt-1.5 text-[13px] leading-relaxed text-doc-ink">{comment}</p>}
          {note && <p className="mt-1 text-[11.5px] italic leading-relaxed text-doc-muted">Inspector note: {note}</p>}
          <ItemPhotos photos={state.photos} alt={title} />
        </div>
      </div>
    </div>
  )
}

/** "Checks passed" rendered line-by-line, each with a Pass badge. */
function PassList({ titles }: { titles: string[] }) {
  if (titles.length === 0) return null
  return (
    <div className="avoid-break overflow-hidden rounded-xl border border-doc-border">
      <p className="flex items-center gap-1.5 border-b border-doc-border bg-doc-surface px-3.5 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#15803D]">
        <CheckCircle2 size={13} /> Checks passed
      </p>
      {titles.map((t) => (
        <div
          key={t}
          className="flex items-center justify-between gap-3 border-b border-doc-border px-3.5 py-2 last:border-0"
        >
          <span className="text-[12px] font-medium text-doc-ink">{t}</span>
          <DocStatusBadge status="pass" />
        </div>
      ))}
    </div>
  )
}

function EmptySection({ label }: { label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-doc-surface ring-1 ring-doc-border">
        <Info size={26} className="text-doc-muted" />
      </div>
      <p className="mt-5 text-lg font-bold text-doc-ink">{label} not assessed</p>
      <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-doc-muted">
        No items were graded in this section for this inspection.
      </p>
    </div>
  )
}

/**
 * Split a section's graded items (template order) into:
 *   issues       Minor / Major items (detailed cards)
 *   passEvidence Pass / N/A items that carry evidence photos (compact card)
 *   passes       Pass / N/A items with no photos (chip list)
 * Pass items can legitimately carry evidence (e.g. OBD scan, battery test, AC
 * reading), so their photos must surface in the customer report too.
 */
function splitItems(report: InspectionReport, section: SectionDef) {
  const state = report.checklist?.[section.id] || {}
  const issues: { title: string; state: ChecklistItemState }[] = []
  const passEvidence: { title: string; state: ChecklistItemState }[] = []
  const passes: string[] = []
  for (const item of section.items) {
    const st = state[item.id]
    // Default-pass: an untouched item counts as a Pass (effectiveStatus), so it
    // still renders instead of being dropped — this keeps a legacy/unseeded report
    // coherent (no "92/92 passed" up top while every section page says "not
    // assessed"). Issue/evidence branches only fire when `st` is present.
    const status = effectiveStatus(st)
    if (st && isIssue(status)) issues.push({ title: item.title, state: st })
    else if (st && (st.photos?.length ?? 0) > 0) passEvidence.push({ title: item.title, state: st })
    else passes.push(item.title)
  }
  return { issues, passEvidence, passes, graded: issues.length + passEvidence.length + passes.length }
}

/** Compact card for a passing item that has supporting evidence photos. */
function PassEvidenceCard({ title, state }: { title: string; state: ChecklistItemState }) {
  const status = itemStatus(state)
  const comment = itemComment(state)
  return (
    <div className="avoid-break rounded-xl border border-doc-border bg-doc-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-doc-ink">{title}</p>
        {status && <DocStatusBadge status={status} />}
      </div>
      {comment && <p className="mt-1 text-[12px] leading-relaxed text-doc-ink">{comment}</p>}
      <ItemPhotos photos={state.photos} alt={title} />
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// Page 1: Cover
// ════════════════════════════════════════════════════════════════════════
export function ReportCoverPage({ report, template }: { report: InspectionReport; template: ResolvedTemplate }) {
  const date = report.inspection_date ? format(new Date(report.inspection_date), 'd MMM yyyy') : null
  const score = overallScore(report.package_type, report.checklist || {})

  const identity = [
    [report.vehicle_year, report.vehicle_make, report.vehicle_model].filter(Boolean).join(' '),
    report.regional_specs,
  ]
    .filter(Boolean)
    .join('  ·  ')

  return (
    <DocPage className="overflow-hidden text-white">
      <div className="relative flex flex-1 flex-col">
        {/* .report-page paints itself white with higher cascade priority than a
            bg utility, so the dark field is its own full-bleed layer. A soft
            vignette behind the headline keeps the black from printing flat. */}
        <div
          className="absolute inset-0 bg-[#0a0a0a]"
          style={{ background: 'radial-gradient(120% 85% at 18% 42%, #151515 0%, #0a0a0a 58%)' }}
        />
        {/* The brand crescent — its own element behind the car: the actual mark
            reading as the moon, with a soft ambient glow around it. */}
        <div className="absolute left-[470px] top-[55px] h-[460px] w-[460px]">
          <div
            className="absolute -inset-20 rounded-full"
            style={{
              background:
                'radial-gradient(circle, rgba(255,198,0,0.06) 28%, rgba(255,198,0,0.02) 52%, transparent 68%)',
            }}
          />
          <DocImg
            src="/crescent-mark-tight.png"
            className="object-contain"
            style={{ opacity: 0.2, filter: 'blur(1px)' }}
          />
        </div>

        {/* The car — its own element emerging from the dark. Three passes of the
            same transparent PNG: a blurred ghost the rim dissolves into, the sharp
            darkened body masked to the core, and a screen-blended highlight pass
            so the running lights glow. The wrapper mask fades the whole element's
            opacity out toward its edges. */}
        <div
          className="absolute right-[-276px] top-[300px] h-[490px] w-[700px]"
          style={{
            WebkitMaskImage:
              'radial-gradient(78% 72% at 46% 46%, #000 52%, rgba(0,0,0,0.75) 70%, rgba(0,0,0,0.25) 88%, transparent 100%)',
            maskImage:
              'radial-gradient(78% 72% at 46% 46%, #000 52%, rgba(0,0,0,0.75) 70%, rgba(0,0,0,0.25) 88%, transparent 100%)',
          }}
        >
          <DocImg
            src="/cover-car.png"
            className="object-contain"
            style={{ filter: 'brightness(0.55) saturate(0.85) contrast(1.15) blur(4px)' }}
          />
          <DocImg
            src="/cover-car.png"
            className="object-contain"
            style={{
              filter: 'brightness(0.55) saturate(0.85) contrast(1.15)',
              WebkitMaskImage:
                'radial-gradient(72% 66% at 46% 46%, #000 40%, rgba(0,0,0,0.55) 64%, transparent 84%)',
              maskImage:
                'radial-gradient(72% 66% at 46% 46%, #000 40%, rgba(0,0,0,0.55) 64%, transparent 84%)',
            }}
          />
          <DocImg
            src="/cover-car.png"
            className="object-contain"
            style={{
              mixBlendMode: 'screen',
              opacity: 0.75,
              filter: 'brightness(0.85) contrast(1.6) saturate(0.75)',
              WebkitMaskImage:
                'radial-gradient(72% 66% at 46% 46%, #000 40%, rgba(0,0,0,0.55) 64%, transparent 84%)',
              maskImage:
                'radial-gradient(72% 66% at 46% 46%, #000 40%, rgba(0,0,0,0.55) 64%, transparent 84%)',
            }}
          />
        </div>
        {/* Ground the car: fade its lower body into the field above the stat card. */}
        <div className="absolute right-0 top-[640px] h-[180px] w-[480px] bg-gradient-to-b from-transparent to-[#0a0a0a]" />

        {/* Gold top rule — the same signature every inner page carries via DocHeader. */}
        <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-accent via-accent/50 to-transparent" />

        <div className="relative px-14 pt-[84px]">
          <span className="relative block h-[64px] w-[340px]">
            <DocImg src="/logo-wordmark.png" alt="Crescent Car Check" className="object-contain object-left" />
          </span>
        </div>

        <div className="relative mt-[170px] px-14">
          <div className="h-[3px] w-14 rounded-full bg-accent" />
          <p className="mt-7 text-[11.5px] font-semibold uppercase tracking-[0.42em] text-white/90">Vehicle Inspection Report</p>
          <h1 className="mt-4 text-[64px] font-black italic uppercase leading-[1.14] tracking-tight">
            <span className="block text-white">Inspect</span>
            <span className="block text-accent">Before</span>
            <span className="block text-white">You Invest.</span>
          </h1>
          <p className="mt-6 text-[15px] font-medium text-white/75">Buy With Confidence and Avoid Hidden Surprises!</p>
          {identity && (
            <p className="mt-7 text-[12px] font-bold uppercase tracking-[0.28em] text-accent">{identity}</p>
          )}
        </div>

        {/* Key facts + footer pinned to the bottom of the sheet. */}
        <div className="relative mt-auto">
          <div className="px-12">
            {report.customer_name && (
              <p className="mb-5 text-center text-[10px] font-semibold uppercase tracking-[0.3em] text-white/45">
                Prepared exclusively for <span className="text-white/90">{report.customer_name}</span>
              </p>
            )}
            <div className="grid auto-cols-fr grid-flow-col divide-x divide-white/10 rounded-[22px] border border-white/10 bg-white/[0.045] py-7">
              <CoverStat icon={<ShieldCheck size={30} strokeWidth={1.6} />} label="Package" value={template.name} sub={template.pointLabel} />
              {date && <CoverStat icon={<CalendarDays size={30} strokeWidth={1.6} />} label="Inspection date" value={date} />}
              <CoverStat icon={<FileText size={30} strokeWidth={1.6} />} label="Reference" value={report.report_reference} />
              {score != null && <CoverStat icon={<ScoreRing score={score} />} label="Crescent Score" value={`${score}/100`} />}
            </div>
          </div>

          <div className="mt-11 flex items-center justify-between border-t border-white/10 px-14 py-7">
            <span className="flex items-center gap-2.5 text-[13.5px] font-medium text-white/85">
              <Globe size={17} className="text-accent" />
              crescentcarcheck.com
            </span>
            <p className="text-[13.5px] font-medium text-white/85">
              Driven by <span className="text-accent">Trust.</span> Backed by <span className="text-accent">Detail.</span>
            </p>
          </div>
        </div>
      </div>
    </DocPage>
  )
}

/** Gold arc that fills to the actual score — every cover's gauge is its own. */
function ScoreRing({ score }: { score: number }) {
  const r = 15.5
  const c = 2 * Math.PI * r
  const filled = (Math.max(0, Math.min(100, score)) / 100) * c
  return (
    <svg width={34} height={34} viewBox="0 0 36 36" className="-rotate-90">
      <circle cx={18} cy={18} r={r} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={3} />
      <circle
        cx={18}
        cy={18}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeDasharray={`${filled} ${c - filled}`}
      />
    </svg>
  )
}

function CoverStat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center px-3 text-center">
      <span className="flex h-9 items-center text-accent">{icon}</span>
      <p className="mt-3.5 text-[9.5px] font-bold uppercase tracking-[0.22em] text-white/55">{label}</p>
      <p className="tnum mt-1.5 text-[16px] font-bold text-white">{value}</p>
      {sub && <p className="mt-1 text-[11px] text-white/45">{sub}</p>}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// Page 2: Vehicle Summary (not scored)
// ════════════════════════════════════════════════════════════════════════
export function ReportVehicleSummaryPage({
  report,
  template,
  index,
  inspectorName,
}: {
  report: InspectionReport
  template: ResolvedTemplate
  index: string
  inspectorName?: string | null
}) {
  const date = report.inspection_date ? format(new Date(report.inspection_date), 'd MMMM yyyy') : null

  const highlights = [
    { icon: <Gauge size={15} />, label: 'Mileage', value: report.odometer },
    { icon: <Cog size={15} />, label: 'Transmission', value: report.transmission },
    { icon: <Cylinder size={15} />, label: 'Engine size', value: report.engine_size },
    { icon: <Fuel size={15} />, label: 'Fuel type', value: report.fuel_type },
    { icon: <Globe size={15} />, label: 'Regional specs', value: report.regional_specs },
    { icon: <Calendar size={15} />, label: 'Inspection date', value: date },
  ]

  return (
    <DocPage watermark>
      <DocHeader label="Vehicle Summary" />
      <div className="flex-1 px-12 pt-9 pb-14">
        <DocSectionTitle index={index}>Vehicle Summary</DocSectionTitle>

        <div className="grid grid-cols-5 gap-8">
          <div className="col-span-2">
            <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-doc-border bg-doc-surface">
              {report.main_vehicle_image_url ? (
                <DocImg src={report.main_vehicle_image_url} alt={vehicleTitle(report)} className="object-cover" />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-1.5 text-doc-muted">
                  <Camera size={28} />
                  <span className="text-[11px]">Vehicle photo</span>
                </div>
              )}
            </div>
            <p className="mt-3 text-[17px] font-extrabold leading-tight text-doc-ink">{vehicleTitle(report)}</p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-accent">
              {template.name} · {template.pointLabel}
            </p>

            <MiniHeading className="mt-5">Inspection</MiniHeading>
            <div className="rounded-xl border border-doc-border px-3.5">
              <MetaRow icon={<Calendar size={14} />} label="Inspection date" value={date} />
              <MetaRow icon={<Clock size={14} />} label="Time" value={report.inspection_time} />
              <MetaRow icon={<MapPin size={14} />} label="Location" value={report.inspection_location} />
              <MetaRow icon={<UserRound size={14} />} label="Inspector" value={inspectorName} />
              <MetaRow icon={<Hash size={14} />} label="Reference" value={report.report_reference} mono />
            </div>
          </div>

          <div className="col-span-3">
            <MiniHeading>Vehicle Highlights</MiniHeading>
            <div className="grid grid-cols-3 gap-3">
              {highlights.map((h) => (
                <HighlightTile key={h.label} icon={h.icon} label={h.label} value={h.value} />
              ))}
            </div>

            <MiniHeading className="mt-6">Specifications</MiniHeading>
            <div className="grid grid-cols-2 gap-x-8">
              <DocField label="Make" value={report.vehicle_make} />
              <DocField label="Model" value={report.vehicle_model} />
              <DocField label="Model year" value={report.vehicle_year} />
              <DocField label="VIN / chassis" value={report.vin} />
              <DocField label="Plate number" value={report.plate_number} />
              <DocField label="Engine size" value={report.engine_size} />
              <DocField label="Exterior colour" value={report.exterior_colour} />
              <DocField label="Regional specs" value={report.regional_specs} />
            </div>

            <MiniHeading className="mt-6">Customer</MiniHeading>
            <div className="grid grid-cols-2 gap-x-8">
              <DocField label="Customer name" value={report.customer_name} />
              <DocField label="Customer phone" value={report.customer_phone} />
              <DocField label="Customer email" value={report.customer_email} />
              <DocField label="Report status" value={report.status === 'completed' ? 'Completed' : 'Draft'} />
            </div>
          </div>
        </div>
      </div>
      <DocFooter reference={report.report_reference} note="Vehicle summary" />
    </DocPage>
  )
}

function HighlightTile({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string | null }) {
  return (
    <div className="rounded-xl border border-doc-border bg-doc-surface p-3">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/15 text-doc-ink">{icon}</span>
        <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-doc-muted">{label}</p>
      </div>
      <p className="mt-2 text-[13px] font-bold text-doc-ink">{value || '—'}</p>
    </div>
  )
}

function MetaRow({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="flex items-center gap-3 border-b border-doc-border py-2.5 last:border-0">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-doc-surface text-accent ring-1 ring-doc-border">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[8.5px] font-semibold uppercase tracking-[0.16em] text-doc-muted">{label}</p>
        <p className={`text-[12px] font-medium text-doc-ink ${mono ? 'font-mono' : ''}`}>{value || '—'}</p>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// Page 3: Executive Summary (Crescent Score)
// ════════════════════════════════════════════════════════════════════════
/** Max "Key Issues" rows on the single-page summary before a "+N more" line —
 *  sized to fit alongside the hero + section cards on one A4 sheet. */
const EXEC_KEY_ISSUE_LIMIT = 6
export function ReportExecutiveSummaryPage({
  report,
  template,
  index,
}: {
  report: InspectionReport
  template: ResolvedTemplate
  index: string
}) {
  const checklist = report.checklist || {}
  const counts = computeCounts(report.package_type, checklist)
  const score = overallScore(report.package_type, checklist)
  const rec = normalizeRecommendation(report.buyer_recommendation) ?? recommendationFromScore(score)
  const cards = sectionScores(report.package_type, checklist)
  const majorFindings = deriveAutoFindings(report.package_type, checklist)

  return (
    <DocPage>
      <DocHeader label="Executive Summary" />
      <div className="flex-1 px-12 pt-9 pb-14">
        <DocSectionTitle index={index}>Executive Summary</DocSectionTitle>

        {/* Hero: score gauge + recommendation + counts */}
        <div className="flex items-center gap-7 rounded-2xl border border-doc-border bg-doc-surface p-6">
          <HealthGauge score={score} />
          <div className="min-w-0 flex-1">
            {template.recommendationEnabled ? (
              <>
                <p className="text-[9.5px] font-semibold uppercase tracking-[0.2em] text-doc-muted">Recommendation</p>
                <div className="mt-2">{rec && <RecommendationBadge recommendation={rec} />}</div>
              </>
            ) : (
              <>
                <p className="text-[9.5px] font-semibold uppercase tracking-[0.2em] text-doc-muted">Crescent Score</p>
                <p className="mt-1 text-[15px] font-bold text-doc-ink">{score != null ? `${score} / 100` : 'Not graded'}</p>
              </>
            )}
            <div className="mt-4 grid grid-cols-4 gap-2.5">
              <DocStat label="Completed" value={`${counts.completed}`} sub={`of ${counts.total}`} />
              <DocStat label="Passed" value={`${counts.pass}`} tone="pass" />
              <DocStat label="Minor" value={`${counts.minor}`} tone={counts.minor ? 'attention' : undefined} />
              <DocStat label="Major" value={`${counts.major}`} tone={counts.major ? 'fail' : 'pass'} />
            </div>
          </div>
        </div>

        {/* Section score cards */}
        <MiniHeading className="mt-6">Section Scores</MiniHeading>
        <div className="grid grid-cols-2 gap-3">
          {cards.map((c) => (
            <div key={c.id} className="avoid-break rounded-xl border border-doc-border bg-doc-surface px-4 py-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[12px] font-semibold text-doc-ink">{c.title}</p>
                <p className="tnum text-[14px] font-extrabold text-doc-ink">
                  {c.graded > 0 ? `${c.score}` : '—'}
                  <span className="text-[10px] font-bold text-doc-muted">/100</span>
                </p>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-doc-ink/[0.06]">
                {c.graded > 0 && (
                  <span className="block h-full rounded-full" style={{ width: `${c.score}%`, backgroundColor: bandColor(c.score) }} />
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Key issues — capped so the one-page summary never overflows its fixed
            A4 sheet (every issue is still shown in full on its detailed section
            page). A remainder line points the reader there instead of silently
            dropping issues, as the old hard slice(0,5) did. */}
        {majorFindings.length > 0 && (
          <>
            <MiniHeading className="mt-6">Key Issues</MiniHeading>
            <div className="space-y-1.5">
              {majorFindings.slice(0, EXEC_KEY_ISSUE_LIMIT).map((f) => (
                <div key={f.id} className="avoid-break flex items-start gap-2.5 rounded-lg border-l-[3px] border-fail bg-doc-surface px-3.5 py-2">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-fail" />
                  <div className="min-w-0">
                    <p className="text-[12px] font-bold text-doc-ink">
                      {f.title}
                      {f.section && <span className="ml-1.5 font-medium text-doc-muted">· {f.section}</span>}
                    </p>
                    {f.description && <p className="text-[11px] leading-snug text-doc-muted">{f.description}</p>}
                  </div>
                </div>
              ))}
              {majorFindings.length > EXEC_KEY_ISSUE_LIMIT && (
                <p className="pt-0.5 text-[11px] font-medium text-doc-muted">
                  + {majorFindings.length - EXEC_KEY_ISSUE_LIMIT} more major{' '}
                  {majorFindings.length - EXEC_KEY_ISSUE_LIMIT === 1 ? 'issue' : 'issues'} detailed in the
                  sections that follow.
                </p>
              )}
            </div>
          </>
        )}
      </div>
      <DocFooter reference={report.report_reference} note="Executive summary" />
    </DocPage>
  )
}

/** Render one paginated chunk's blocks in the canonical issues → evidence →
 *  passes order (the chunk is a contiguous slice of that order, so filtering
 *  preserves it). Used by every section that flows onto "(continued)" pages. */
function SectionChunkBody({ chunk }: { chunk: SectionBlock[] }) {
  const { issues, evidence, passes } = splitChunk(chunk)
  return (
    <div className="space-y-3">
      {issues.map((it, i) => (
        <IssueCard key={`i-${i}`} title={it.title} state={it.state} />
      ))}
      {evidence.map((it, i) => (
        <PassEvidenceCard key={`e-${i}`} title={it.title} state={it.state} />
      ))}
      <PassList titles={passes} />
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// Generic scored-section page (Interior, Engine Bay, Underbody, etc.)
// One section can now emit several A4 pages — long sections flow onto
// "(continued)" pages instead of overflowing a single fixed-height sheet.
// ════════════════════════════════════════════════════════════════════════
export function ScoredSectionPage({
  report,
  sectionId,
  index,
}: {
  report: InspectionReport
  sectionId: string
  index: string
}) {
  const section = getTemplate(report.package_type).sections.find((s) => s.id === sectionId)
  if (!section) return null
  const { issues, passEvidence, passes, graded } = splitItems(report, section)

  if (graded === 0) {
    return (
      <DocPage watermark>
        <DocHeader label={section.title} />
        <div className="flex flex-1 flex-col px-12 pt-9 pb-14">
          <DocSectionTitle index={index}>{section.title}</DocSectionTitle>
          <EmptySection label={section.title} />
        </div>
        <DocFooter reference={report.report_reference} note={section.title} />
      </DocPage>
    )
  }

  const chunks = paginateSectionBlocks(buildSectionBlocks({ issues, passEvidence, passes }))
  return chunks.map((chunk, ci) => (
    <DocPage key={ci}>
      <DocHeader label={section.title} />
      <div className="flex flex-1 flex-col px-12 pt-9 pb-14">
        <DocSectionTitle index={ci === 0 ? index : undefined}>
          {section.title}
          {ci > 0 ? ' (continued)' : ''}
        </DocSectionTitle>
        {ci === 0 && <SectionScoreHeader report={report} sectionId={section.id} items={section.items} />}
        <SectionChunkBody chunk={chunk} />
      </div>
      <DocFooter reference={report.report_reference} note={section.title} />
    </DocPage>
  ))
}

// ════════════════════════════════════════════════════════════════════════
// Accident History Search
// ════════════════════════════════════════════════════════════════════════
export function ReportAccidentHistoryPage({ report, index }: { report: InspectionReport; index: string }) {
  const section = getTemplate(report.package_type).sections.find((s) => s.id === 'accident-history')
  if (!section) return null
  const { issues, passEvidence, passes, graded } = splitItems(report, section)

  if (graded === 0) {
    return (
      <DocPage watermark>
        <DocHeader label="Accident History" />
        <div className="flex flex-1 flex-col px-12 pt-9 pb-14">
          <DocSectionTitle index={index}>Accident History Search</DocSectionTitle>
          <AccidentNotice />
          <EmptySection label="Accident history" />
        </div>
        <DocFooter reference={report.report_reference} note="Accident history" />
      </DocPage>
    )
  }

  // leadMm reserves first-page space for the "Important" notice, which only shows
  // on page 1 (continuation pages skip it).
  const chunks = paginateSectionBlocks(buildSectionBlocks({ issues, passEvidence, passes }), { leadMm: 26 })
  return chunks.map((chunk, ci) => (
    <DocPage key={ci}>
      <DocHeader label="Accident History" />
      <div className="flex flex-1 flex-col px-12 pt-9 pb-14">
        <DocSectionTitle index={ci === 0 ? index : undefined}>
          Accident History Search{ci > 0 ? ' (continued)' : ''}
        </DocSectionTitle>
        {ci === 0 && <SectionScoreHeader report={report} sectionId={section.id} items={section.items} />}
        {ci === 0 && <AccidentNotice />}
        <SectionChunkBody chunk={chunk} />
      </div>
      <DocFooter reference={report.report_reference} note="Accident history" />
    </DocPage>
  ))
}

/** The standing "no record ≠ never crashed" disclaimer on the accident page. */
function AccidentNotice() {
  return (
    <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-doc-border bg-doc-surface px-4 py-3">
      <Info size={16} className="mt-0.5 shrink-0 text-accent" />
      <p className="text-[12px] leading-relaxed text-doc-ink">
        <span className="font-semibold">Important:</span> no accident record found does not guarantee the car has never
        been involved in an accident. It only means no accident record was found in the sources checked.
      </p>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// Exterior, Paint & Panel Alignment (paint map + scored issues)
// ════════════════════════════════════════════════════════════════════════
export function ReportExteriorPage({ report, index }: { report: InspectionReport; index: string }) {
  const checklist = report.checklist || {}
  const section = getTemplate(report.package_type).sections.find((s) => s.id === 'exterior')
  if (!section) return null

  const paintState = checklist[PAINT_SECTION_ID] || {}
  const paintMap: PaintMap = {}
  const paintRows: { label: string; condition: PaintCondition }[] = []
  for (const panel of PAINT_PANELS) {
    // Default-pass: an untouched panel is Original (matches computeCounts and the
    // exec-summary count), so a legacy/unseeded report shows "Panels 13/13" rather
    // than "0/13" sitting next to a "92/92 completed" summary. Seeded reports
    // already store all 13 as original, so this is a no-op for them.
    const c = paintState[panel.id]?.paint ?? 'original'
    paintMap[panel.id] = c
    paintRows.push({ label: panel.label, condition: c })
  }

  const { issues, passEvidence, passes } = splitItems(report, section)

  // Exterior is panel-driven: the 13 paint panels are the checked points, on top
  // of the scored exterior issues — so show panel stats, not the generic tally.
  const assessedPanels = paintRows.length
  const originalPanels = paintRows.filter((r) => r.condition === 'original').length
  const refinishedPanels = assessedPanels - originalPanels
  const exteriorTally = sectionCounts(checklist, 'exterior')
  const issuesFlagged = exteriorTally.minor + exteriorTally.major
  const exteriorScore = Math.max(
    0,
    // Pass the section id so deductions are tallied over current-template items
    // only (matching the Executive Summary card + SectionScoreHeader); without
    // it, orphaned legacy keys would make this pill disagree with the summary.
    sectionScore(checklist['exterior'] || {}, 'exterior') - paintDeductionsFor(checklist[PAINT_SECTION_ID]),
  )

  // Paginate the exterior issue blocks so a heavily-damaged car (now up to 4
  // detailed cards on every package + pass rows) can't overflow the single
  // fixed-height sheet and clip content. Page 1 keeps the score row, paint map and
  // paint list with the blocks that fit beside them; overflow flows onto full-width
  // "(continued)" pages like every other scored section. leadMm is deliberately
  // generous — it reserves the full-width paint map AND the narrower col-span-3
  // issue column — so blocks never clip (at worst an extra, lightly-filled page).
  const exteriorBlocks = buildSectionBlocks({ issues, passEvidence, passes })
  const [firstChunk = [], ...contChunks] = paginateSectionBlocks(exteriorBlocks, { leadMm: 110 })
  const firstCol = splitChunk(firstChunk)

  return (
    <>
    <DocPage>
      <DocHeader label="Exterior & Paint" />
      <div className="flex-1 px-12 pt-9 pb-14">
        <DocSectionTitle index={index}>{section.title}</DocSectionTitle>

        <div className="mb-5 flex items-stretch gap-3">
          <div
            className="flex flex-col justify-center rounded-xl px-5 py-3 text-white"
            style={{ backgroundColor: bandColor(exteriorScore) }}
          >
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/80">Section score</p>
            <p className="tnum text-[24px] font-extrabold leading-none">
              {exteriorScore}
              <span className="text-[13px] font-bold text-white/80">/100</span>
            </p>
          </div>
          <div className="flex flex-1 items-center gap-5 rounded-xl border border-doc-border bg-doc-surface px-5">
            <ScoreTally label="Panels" value={`${assessedPanels}/${PAINT_PANELS.length}`} />
            <ScoreTally label="Original" value={`${originalPanels}`} tone="pass" />
            <ScoreTally label="Re-finished" value={`${refinishedPanels}`} tone={refinishedPanels ? 'minor' : undefined} />
            <ScoreTally label="Issues" value={`${issuesFlagged}`} tone={issuesFlagged ? 'major' : undefined} />
          </div>
        </div>

        {/* Colour-coded exterior paint map (right side · top · left side) */}
        <div className="mb-5 rounded-xl border border-doc-border bg-doc-surface p-3.5">
          <ExteriorBodyMap paint={paintMap} />
          <div className="mt-3 border-t border-doc-border pt-2.5">
            <PaintLegend />
          </div>
        </div>

        <div className="grid grid-cols-5 gap-8">
          <div className="col-span-2">
            <MiniHeading>Paint Condition · all panels</MiniHeading>
            {paintRows.length > 0 ? (
              <div className="grid grid-cols-1 gap-y-0.5 rounded-xl border border-doc-border p-2.5">
                {paintRows.map((r) => (
                  <div key={r.label} className="flex items-center justify-between gap-2 px-1.5 py-1">
                    <span className="truncate text-[11px] font-medium text-doc-ink">{r.label}</span>
                    <span className="shrink-0 text-[10px] font-bold" style={{ color: PAINT_HEX[r.condition] }}>
                      {PAINT_SHORT[r.condition]}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-doc-border px-3.5 py-2.5 text-[11px] text-doc-muted">
                Paint recorded as original / not separately marked.
              </p>
            )}
          </div>

          <div className="col-span-3">
            <MiniHeading>Exterior Issues</MiniHeading>
            {firstCol.issues.length > 0 ? (
              <div className="space-y-3">
                {firstCol.issues.map((it, i) => (
                  <IssueCard key={i} title={it.title} state={it.state} />
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-doc-border px-3.5 py-2.5 text-[11px] text-doc-muted">
                No scratches, dents, panel-alignment or chassis issues recorded.
              </p>
            )}
            {firstCol.evidence.length > 0 && (
              <div className="mt-3 space-y-3">
                {firstCol.evidence.map((it, i) => (
                  <PassEvidenceCard key={`pe-${i}`} title={it.title} state={it.state} />
                ))}
              </div>
            )}
            <div className="mt-3">
              <PassList titles={firstCol.passes} />
            </div>
          </div>
        </div>
      </div>
      <DocFooter reference={report.report_reference} note="Exterior & paint" />
    </DocPage>
    {contChunks.map((chunk, ci) => (
      <DocPage key={ci}>
        <DocHeader label="Exterior & Paint" />
        <div className="flex flex-1 flex-col px-12 pt-9 pb-14">
          <DocSectionTitle>{section.title} (continued)</DocSectionTitle>
          <SectionChunkBody chunk={chunk} />
        </div>
        <DocFooter reference={report.report_reference} note="Exterior & paint" />
      </DocPage>
    ))}
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════
// Tyres, Rims & Brakes (wheel diagram + per-corner cards)
// ════════════════════════════════════════════════════════════════════════
/** Bordered brake-item list (title + comment + status + photos). */
function BrakesList({ items }: { items: { title: string; state: ChecklistItemState }[] }) {
  return (
    <div className="rounded-xl border border-doc-border">
      {items.length > 0 ? (
        items.map((it, i) => (
          <div key={i} className="avoid-break border-b border-doc-border px-3.5 py-2 last:border-0">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium text-doc-ink">{it.title}</p>
                {itemComment(it.state) && (
                  <p className="mt-0.5 text-[11px] leading-snug text-doc-muted">{itemComment(it.state)}</p>
                )}
              </div>
              <DocStatusBadge status={itemStatus(it.state) as ChecklistStatus} />
            </div>
            <ItemPhotos photos={it.state.photos} alt={it.title} />
          </div>
        ))
      ) : (
        <p className="px-3.5 py-2.5 text-[11px] text-doc-muted">Brakes not separately graded.</p>
      )}
    </div>
  )
}

export function ReportTyresBrakesPage({ report, index }: { report: InspectionReport; index: string }) {
  const checklist = report.checklist || {}
  const section = getTemplate(report.package_type).sections.find((s) => s.id === 'tyres-brakes')
  if (!section) return null
  const state = checklist['tyres-brakes'] || {}

  const corners: CornerStatuses = {
    fl: itemStatus(state['tyre-fl']),
    fr: itemStatus(state['tyre-fr']),
    rl: itemStatus(state['tyre-rl']),
    rr: itemStatus(state['tyre-rr']),
  }
  const cornerDefs = [
    { id: 'tyre-fl', rim: 'rim-fl', label: 'Front Left' },
    { id: 'tyre-fr', rim: 'rim-fr', label: 'Front Right' },
    { id: 'tyre-rl', rim: 'rim-rl', label: 'Rear Left' },
    { id: 'tyre-rr', rim: 'rim-rr', label: 'Rear Right' },
  ]

  const brakeIds = ['brake-pads', 'brake-discs', 'brake-vibration']
  const brakeItems = section.items.filter((it) => brakeIds.includes(it.id) && itemStatus(state[it.id]))

  // The corner-card grid + brakes share the right column; estimate how much the
  // 2×2 corner grid consumes so brakes that don't fit flow onto a continuation
  // page instead of clipping (the "brake photo cut in half" bug).
  const cornerCardMm = (c: { id: string; rim: string }) => {
    const photos = (state[c.id]?.photos?.length ?? 0) + (state[c.rim]?.photos?.length ?? 0)
    return 24 + photos * 28 + (itemComment(state[c.id]) ? 6 : 0) // narrow card → ~1 photo per row
  }
  const cornerBlockMm =
    8 +
    Math.max(cornerCardMm(cornerDefs[0]), cornerCardMm(cornerDefs[1])) +
    Math.max(cornerCardMm(cornerDefs[2]), cornerCardMm(cornerDefs[3]))

  const brakeBlocks: SectionBlock[] = brakeItems.map((it) => ({
    kind: 'evidence',
    title: it.title,
    state: state[it.id] as ChecklistItemState,
  }))
  const brakeChunks =
    brakeBlocks.length > 0 ? paginateSectionBlocks(brakeBlocks, { leadMm: cornerBlockMm + 10 }) : [[]]
  const firstBrakes = splitChunk(brakeChunks[0]).evidence
  const contChunks = brakeChunks.slice(1)
  // If the corner grid leaves no room at all, push every brake to the continuation.
  const brakesOnFirst = firstBrakes.length > 0 || brakeItems.length === 0

  const pages = [
    <DocPage key="tyres-0">
      <DocHeader label="Tyres & Brakes" />
      <div className="flex flex-1 flex-col px-12 pt-9 pb-14">
        <DocSectionTitle index={index}>Tyres, Rims &amp; Brakes</DocSectionTitle>
        <SectionScoreHeader report={report} sectionId={section.id} items={section.items} />
        <div className="grid grid-cols-5 gap-8">
          <div className="col-span-2 flex flex-col items-center">
            <WheelLayout corners={corners} />
            <div className="mt-5 w-full">
              <DiagramLegend />
            </div>
          </div>
          <div className="col-span-3">
            <MiniHeading>Tyres &amp; Rims</MiniHeading>
            <div className="grid grid-cols-2 gap-3">
              {cornerDefs.map((c) => (
                <CornerTyreCard key={c.id} label={c.label} tyre={state[c.id]} rim={state[c.rim]} />
              ))}
            </div>
            {brakesOnFirst && (
              <>
                <MiniHeading className="mt-6">Brakes</MiniHeading>
                <BrakesList items={firstBrakes} />
              </>
            )}
          </div>
        </div>
      </div>
      <DocFooter reference={report.report_reference} note="Tyres & brakes" />
    </DocPage>,
  ]

  contChunks.forEach((chunk, ci) => {
    pages.push(
      <DocPage key={`tyres-${ci + 1}`}>
        <DocHeader label="Tyres & Brakes" />
        <div className="flex flex-1 flex-col px-12 pt-9 pb-14">
          <DocSectionTitle>Tyres, Rims &amp; Brakes (continued)</DocSectionTitle>
          <MiniHeading>Brakes</MiniHeading>
          <BrakesList items={splitChunk(chunk).evidence} />
        </div>
        <DocFooter reference={report.report_reference} note="Tyres & brakes" />
      </DocPage>,
    )
  })

  return pages
}

function CornerTyreCard({ label, tyre, rim }: { label: string; tyre?: ChecklistItemState; rim?: ChecklistItemState }) {
  const tStatus = itemStatus(tyre)
  const rStatus = itemStatus(rim)
  const comment = itemComment(tyre)
  return (
    <div className="avoid-break rounded-xl border border-doc-border bg-doc-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-doc-ink">{label}</p>
        {tStatus ? <DocStatusBadge status={tStatus} /> : <span className="text-[11px] text-doc-muted">—</span>}
      </div>
      <div className="mt-1.5 space-y-0.5 text-[10.5px] text-doc-muted">
        {tyre?.tyreManufacturer && <p><span className="font-semibold text-doc-ink">Make:</span> {tyre.tyreManufacturer}</p>}
        {tyre?.tyreDate && <p><span className="font-semibold text-doc-ink">Manufactured:</span> {decodeDot(tyre.tyreDate)}</p>}
        {tyre?.tread && <p><span className="font-semibold text-doc-ink">Tread depth:</span> {tyre.tread}</p>}
        {rStatus && (
          <p className="flex items-center gap-1">
            <span className="font-semibold text-doc-ink">Rim condition:</span> {STATUS_LABEL[rStatus]}
          </p>
        )}
      </div>
      {comment && <p className="mt-1.5 text-[11px] leading-snug text-doc-ink">{comment}</p>}
      {/* Merge the corner's tyre + rim photos, de-duped by id so a single uploaded
          wheel photo can never render twice (brief item 6 — the Lexus LS250 glitch). */}
      <ItemPhotos
        photos={[...(tyre?.photos ?? []), ...(rim?.photos ?? [])].filter(
          (p, i, arr) => arr.findIndex((q) => q.id === p.id) === i,
        )}
        alt={label}
      />
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// Endoscopic Camera Evidence (Premium, if applicable)
// ════════════════════════════════════════════════════════════════════════
/** One endoscopic-evidence card (title + comment + photos). */
function EndoscopicCard({ title, state }: { title: string; state: ChecklistItemState }) {
  const status = itemStatus(state)
  return (
    <div className="avoid-break rounded-xl border border-doc-border bg-doc-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-bold text-doc-ink">{title}</p>
        {status && <DocStatusBadge status={status} />}
      </div>
      {itemComment(state) && <p className="mt-1 text-[12.5px] leading-relaxed text-doc-ink">{itemComment(state)}</p>}
      <ItemPhotos photos={state.photos} alt={title} />
    </div>
  )
}

export function ReportEndoscopicPage({ report, index }: { report: InspectionReport; index: string }) {
  const section = getTemplate(report.package_type).sections.find((s) => s.id === 'endoscopic')
  if (!section) return null
  const state = report.checklist?.['endoscopic'] || {}
  const graded = section.items.filter((it) => itemStatus(state[it.id]) || (state[it.id]?.photos?.length ?? 0) > 0)

  if (graded.length === 0) {
    return (
      <DocPage watermark>
        <DocHeader label="Endoscopic Evidence" />
        <div className="flex flex-1 flex-col px-12 pt-9 pb-14">
          <DocSectionTitle index={index}>Endoscopic Camera Evidence</DocSectionTitle>
          <EmptySection label="Endoscopic inspection" />
        </div>
        <DocFooter reference={report.report_reference} note="Endoscopic evidence" />
      </DocPage>
    )
  }

  // No score header on this section, so the first page gets the full (continued) budget.
  const blocks: SectionBlock[] = graded.map((it) => ({
    kind: 'evidence',
    title: it.title,
    state: state[it.id] as ChecklistItemState,
  }))
  const chunks = paginateSectionBlocks(blocks, { firstMm: SECTION_CONT_MM })
  return chunks.map((chunk, ci) => (
    <DocPage key={ci}>
      <DocHeader label="Endoscopic Evidence" />
      <div className="flex flex-1 flex-col px-12 pt-9 pb-14">
        <DocSectionTitle index={ci === 0 ? index : undefined}>
          Endoscopic Camera Evidence{ci > 0 ? ' (continued)' : ''}
        </DocSectionTitle>
        <div className="space-y-3">
          {splitChunk(chunk).evidence.map((it, i) => (
            <EndoscopicCard key={i} title={it.title} state={it.state} />
          ))}
        </div>
      </div>
      <DocFooter reference={report.report_reference} note="Endoscopic evidence" />
    </DocPage>
  ))
}

// ════════════════════════════════════════════════════════════════════════
// Photo Gallery — split into Exterior / Interior (extra photos only)
// ════════════════════════════════════════════════════════════════════════
export function ReportPhotoGalleryPage({
  report,
  index,
  title,
  photos,
}: {
  report: InspectionReport
  index: string
  title: string
  photos: PhotoRef[]
}) {
  if (photos.length === 0) {
    return (
      <DocPage watermark>
        <DocHeader label="Photo Gallery" />
        <div className="flex flex-1 flex-col px-12 pt-9 pb-14">
          <DocSectionTitle index={index}>{title}</DocSectionTitle>
          <EmptySection label={title} />
        </div>
        <DocFooter reference={report.report_reference} note={title} />
      </DocPage>
    )
  }

  const chunks = paginatePhotos(photos)
  return chunks.map((chunk, ci) => (
    <DocPage key={ci}>
      <DocHeader label="Photo Gallery" />
      <div className="flex flex-1 flex-col px-12 pt-9 pb-14">
        <DocSectionTitle index={ci === 0 ? index : undefined}>
          {title}
          {ci > 0 ? ' (continued)' : ''}
        </DocSectionTitle>
        <div className="grid grid-cols-3 gap-3">
          {chunk.map((p) => (
            <figure key={p.id} className="avoid-break">
              <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-doc-border bg-doc-surface">
                <DocImg
                  src={p.url}
                  alt={p.caption || 'Photo'}
                  className={p.fit === 'contain' ? 'object-contain' : 'object-cover'}
                />
              </div>
              {p.caption && <figcaption className="mt-1.5 text-[10.5px] text-doc-muted">{p.caption}</figcaption>}
            </figure>
          ))}
        </div>
      </div>
      <DocFooter reference={report.report_reference} note={title} />
    </DocPage>
  ))
}

// ════════════════════════════════════════════════════════════════════════
// Final Recommendation & Inspector Summary
// ════════════════════════════════════════════════════════════════════════
export function ReportFinalNotesPage({
  report,
  template,
  index,
}: {
  report: InspectionReport
  template: ResolvedTemplate
  index: string
}) {
  const completed = report.completed_at ? format(new Date(report.completed_at), 'd MMMM yyyy') : null
  const score = overallScore(report.package_type, report.checklist || {})
  const rec = normalizeRecommendation(report.buyer_recommendation) ?? recommendationFromScore(score)
  const showRec = template.recommendationEnabled && Boolean(rec)

  const notes: { title: string; body: string }[] = []
  if (report.inspector_summary?.trim()) notes.push({ title: 'Inspector Summary', body: report.inspector_summary })
  if (report.price_negotiation_notes?.trim() && template.negotiationNotesEnabled)
    notes.push({ title: 'Price negotiation notes', body: report.price_negotiation_notes })

  const recBox = showRec && rec ? (
    <div className="mb-6 flex items-center gap-4 rounded-2xl border border-doc-border bg-doc-surface px-5 py-4">
      <div>
        <p className="text-[9.5px] font-semibold uppercase tracking-[0.2em] text-doc-muted">Buyer recommendation</p>
        <p className="mt-1 text-[15px] font-extrabold text-doc-ink">{RECOMMENDATION_LABEL[rec]}</p>
      </div>
      <div className="ml-auto flex items-center gap-3">
        {score != null && <span className="tnum text-[15px] font-extrabold text-doc-ink">{score}/100</span>}
        <RecommendationBadge recommendation={rec} />
      </div>
    </div>
  ) : null

  const issuedBox = (
    <div className="mt-auto rounded-2xl border border-doc-border bg-doc-surface px-5 py-4">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-doc-ink">
        <ShieldCheck size={16} className="text-pass" />
        {completed ? `Report issued on ${completed}.` : 'Report prepared by Crescent Car Check.'}
      </div>
      <p className="mt-1.5 text-[11px] text-doc-muted">
        Reference {report.report_reference} · {template.name} · {template.pointLabel}
      </p>
    </div>
  )

  // Notes are unbounded free text — paginate so a long summary flows onto
  // "(continued)" pages instead of clipping. The recommendation box is first-page
  // lead; the issued box packs as a trailing block (its own page only if needed).
  const pages = paginateNotes(notes, {
    firstMm: SECTION_CONT_MM - (showRec ? 34 : 0),
    contMm: SECTION_CONT_MM,
    issuedMm: 30,
  })

  return pages.map((page, pi) => (
    <DocPage key={pi} watermark>
      <DocHeader label="Recommendation" />
      <div className="flex flex-1 flex-col px-12 pt-9 pb-14">
        <DocSectionTitle index={pi === 0 ? index : undefined}>
          Final Recommendation &amp; Inspector Summary{pi > 0 ? ' (continued)' : ''}
        </DocSectionTitle>

        {pi === 0 && recBox}

        <div className="space-y-5">
          {page.runs.map((run, i) => (
            <Callout key={i} title={run.title}>
              {run.text}
            </Callout>
          ))}
          {pi === 0 && notes.length === 0 && (
            <p className="text-[13px] text-doc-muted">No additional notes recorded.</p>
          )}
        </div>

        {page.issued && issuedBox}
      </div>
      <DocFooter reference={report.report_reference} note="Recommendation" />
    </DocPage>
  ))
}

function Callout({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="avoid-break rounded-2xl border-l-[3px] border-accent bg-doc-surface px-5 py-4">
      {title && (
        <p className="mb-1.5 text-[9.5px] font-semibold uppercase tracking-[0.2em] text-doc-muted">{title}</p>
      )}
      <p className="whitespace-pre-line text-[12.5px] leading-relaxed text-doc-ink">{children}</p>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// Legal Disclaimer (brief section 13)
// ════════════════════════════════════════════════════════════════════════
const DISCLAIMER_POINTS: { title: string; body: string }[] = [
  {
    title: 'Scope of Inspection',
    body: 'This report is based on a visual inspection of the vehicle at the time and location of inspection. Crescent Car Check may remove accessible plastic covers, undertrays, or inspection covers where safe, practical, and permitted. However, we do not dismantle mechanical components, open sealed parts, or carry out full workshop-level diagnosis unless expressly stated in the report.',
  },
  {
    title: 'No Guarantee',
    body: 'This report is not a warranty, guarantee, certification, valuation, or confirmation that the vehicle is free from faults. Some issues may be hidden, intermittent, inaccessible, or not visible during the inspection. Crescent Car Check is not responsible for faults that could not reasonably be detected during the inspection.',
  },
  {
    title: 'Not an Official Test',
    body: 'This inspection is a private pre-purchase inspection for the customer’s information only. It is not an RTA test, registration test, insurance inspection, legal certification, or official roadworthiness approval.',
  },
  {
    title: 'Buyer Responsibility',
    body: 'The final decision to buy, reject, or negotiate remains entirely with the customer. Crescent Car Check provides inspection findings and purchase-risk guidance only. Where serious issues are found, further workshop diagnosis is recommended before purchase.',
  },
  {
    title: 'Seller Acknowledgment',
    body: 'By allowing the inspection, the seller acknowledges that Crescent Car Check is acting for the customer/buyer, not the seller. Any disagreement about the vehicle’s condition, price, sale, or disclosure of defects is a matter between the buyer and seller.',
  },
  {
    title: 'No Liability to Seller',
    body: 'Crescent Car Check has no contractual relationship with the seller unless agreed in writing. Crescent Car Check is not responsible for any loss of sale, price reduction, dispute, or claim arising between the buyer and seller as a result of the inspection findings.',
  },
  {
    title: 'Photos and Evidence',
    body: 'Photos in the report are supporting evidence only and may not show every issue, angle, or component inspected. Absence of a photo does not mean an item was not checked.',
  },
  {
    title: 'Limitation of Liability',
    body: 'To the maximum extent permitted by law, Crescent Car Check is not liable for indirect losses, buyer/seller disputes, loss of profit, loss of opportunity, hidden faults, intermittent faults, or issues not reasonably detectable at the time of inspection.',
  },
  {
    title: 'Acceptance',
    body: 'By booking, permitting, or relying on this inspection, the relevant parties accept that the report is limited to the inspection carried out at the time and location of the vehicle inspection.',
  },
]

export function ReportDisclaimerPage({ report, index }: { report: InspectionReport; index: string }) {
  return (
    <DocPage watermark>
      <DocHeader label="Disclaimer" />
      <div className="flex flex-1 flex-col px-12 pt-9 pb-14">
        <DocSectionTitle index={index}>Legal Disclaimer</DocSectionTitle>

        <div className="rounded-2xl border border-doc-border bg-doc-surface p-6">
          <ol className="space-y-3">
            {DISCLAIMER_POINTS.map((p, i) => (
              <li key={i} className="avoid-break flex gap-3 text-[11.5px] leading-relaxed text-doc-ink">
                <span className="tnum mt-0.5 shrink-0 text-[11px] font-bold text-accent">{String(i + 1).padStart(2, '0')}</span>
                <span>
                  <span className="font-bold text-doc-ink">{p.title}. </span>
                  <span className="text-doc-muted">{p.body}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-auto border-t border-doc-border pt-5">
          <p className="text-[11.5px] leading-relaxed text-doc-muted">
            By relying on this report, the recipient acknowledges and accepts the terms of this disclaimer.
          </p>
          <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-doc-muted">
            Crescent Car Reports · by Crescent Car Check · {report.report_reference}
          </p>
        </div>
      </div>
    </DocPage>
  )
}
