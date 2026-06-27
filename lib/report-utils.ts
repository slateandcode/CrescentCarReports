import type {
  AnyChecklistStatus,
  AnyRecommendation,
  ChecklistData,
  ChecklistItemState,
  ChecklistStatus,
  CriticalFinding,
  InspectionReport,
  PackageType,
  PaintCondition,
  ReportCounts,
  Severity,
  OverallCondition,
  BuyerRecommendation,
  ReportStatus,
} from './report-types'
import { getScoredSections, getSection, getTemplate, templateItemCount } from './report-templates'
import { PAINT_SECTION_ID, PAINT_PANELS, generateAccidentComment } from './issues'

// ─── Status normalisation (legacy → canonical) ─────────────────────────────

/** Map any stored status to the canonical Pass / Minor / Major / N/A set. */
export function normalizeStatus(status?: AnyChecklistStatus | null): ChecklistStatus | undefined {
  if (!status) return undefined
  if (status === 'attention') return 'minor'
  if (status === 'fail') return 'major'
  return status
}

/** Canonical status for a stored item state (handles legacy values). */
export function itemStatus(state?: ChecklistItemState | null): ChecklistStatus | undefined {
  return normalizeStatus(state?.status)
}

/**
 * Status for display & counting under the brief's DEFAULT-PASS model (item 4): an
 * item the inspector hasn't touched reads as Pass — they only change what fails.
 * New reports are also seeded with explicit Pass at creation (seedDefaultChecklist),
 * so this mainly keeps legacy reports and any later-added template items consistent
 * without a data migration. Scoring deductions already treat unset as Pass (0
 * deduction), so this does not change any existing report's score.
 */
export function effectiveStatus(state?: ChecklistItemState | null): ChecklistStatus {
  return itemStatus(state) ?? 'pass'
}

/** True when a status is a Minor or Major issue (needs evidence). */
export function isIssue(status?: ChecklistStatus): boolean {
  return status === 'minor' || status === 'major'
}

/** Customer-facing comment for an item (auto-comment, falling back to notes). */
export function itemComment(state?: ChecklistItemState | null): string {
  if (!state) return ''
  return (state.comment ?? state.notes ?? '').trim()
}

/** Inspector custom note, only when distinct from the displayed comment. */
export function itemNote(state?: ChecklistItemState | null): string {
  if (!state) return ''
  const note = (state.notes ?? '').trim()
  const comment = (state.comment ?? '').trim()
  return note && note !== comment ? note : ''
}

/** Ordinal suffix for a small positive integer (1→"1st", 2→"2nd", 3→"3rd"…). */
function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

/**
 * Decode a tyre DOT week/year code into plain English for the customer report.
 * A 4-digit DOT is WWYY — week WW of year 20YY (e.g. "0419" → "4th week of 2019").
 * Anything that isn't a clean, in-range 4-digit code (old 3-digit codes, free text,
 * spaced input) is returned unchanged so unusual values are never mangled or hidden.
 */
export function decodeDot(raw?: string | null): string {
  const value = (raw ?? '').trim()
  if (!/^\d{4}$/.test(value)) return value
  const week = Number(value.slice(0, 2))
  if (week < 1 || week > 53) return value
  return `${ordinal(week)} week of 20${value.slice(2)}`
}

export function normalizeRecommendation(
  rec?: AnyRecommendation | null,
): BuyerRecommendation | undefined {
  if (!rec) return undefined
  if (rec === 'proceed') return 'buy'
  return rec
}

// ─── Labels & colours ────────────────────────────────────────────────────

export const STATUS_LABEL: Record<ChecklistStatus, string> = {
  pass: 'Pass',
  minor: 'Minor Issue',
  major: 'Major Issue',
  na: 'N/A',
}

/** Short label for tight chips. */
export const STATUS_SHORT: Record<ChecklistStatus, string> = {
  pass: 'Pass',
  minor: 'Minor',
  major: 'Major',
  na: 'N/A',
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  minor: 'Minor',
  moderate: 'Moderate',
  major: 'Major',
}

export const CONDITION_LABEL: Record<OverallCondition, string> = {
  good: 'Good',
  caution: 'Caution',
  high_risk: 'High Risk',
}

export const RECOMMENDATION_LABEL: Record<BuyerRecommendation, string> = {
  buy: 'Buy',
  negotiate: 'Negotiate',
  avoid: 'Avoid',
}

export const STATUS_OPTIONS: ChecklistStatus[] = ['pass', 'minor', 'major']
export const SEVERITY_OPTIONS: Severity[] = ['minor', 'moderate', 'major']

/** Hex per status — used by the donut chart and diagrams. Minor=amber, Major=red. */
export const STATUS_HEX: Record<ChecklistStatus, string> = {
  pass: '#22C55E',
  minor: '#F59E0B',
  major: '#EF4444',
  na: '#6B7280',
}

// ─── Scoring constants (brief section 8 / 9) ───────────────────────────────

export const MINOR_DEDUCTION = 10
export const MAJOR_DEDUCTION = 30

/** Accident History is scored on its own scale (brief section 6): a single
 *  finding weighted heavily — Minor → 70/100, Major → 0/100. */
export const ACCIDENT_SECTION_ID = 'accident-history'
export const ACCIDENT_MINOR_DEDUCTION = 30
export const ACCIDENT_MAJOR_DEDUCTION = 100

/** Score impact per non-original exterior paint panel (applied to the exterior
 *  section): re-painted / faded −5, cosmetic −2, original 0. */
export const PAINT_DEDUCTION: Record<PaintCondition, number> = {
  original: 0,
  cosmetic: 2,
  repainted: 5,
  faded: 5,
}

/** Total exterior-score deduction from a paint-panel state map. */
export function paintDeductionsFor(paintState?: Record<string, ChecklistItemState>): number {
  if (!paintState) return 0
  let d = 0
  for (const v of Object.values(paintState)) {
    if (v?.paint) d += PAINT_DEDUCTION[v.paint] ?? 0
  }
  return d
}

/** Number of exterior paint panels that have been assessed (have a condition). */
export function assessedPaintPanels(checklist: ChecklistData): number {
  const paintState = checklist[PAINT_SECTION_ID]
  if (!paintState) return 0
  return Object.values(paintState).filter((v) => v?.paint).length
}

// ─── Counts & completion ──────────────────────────────────────────────────

/**
 * Tally pass/minor/major/na + completion across the SCORED template items.
 *
 * Default-pass (brief item 4/8): an untouched item counts as Pass and an
 * untouched paint panel as Original, so `completed` always equals `total` for a
 * fresh report (no more "99/101"). The inspector only changes what fails.
 */
export function computeCounts(pkg: PackageType, checklist: ChecklistData): ReportCounts {
  // Total possible points = scored checklist items + the 13 exterior paint panels.
  const counts: ReportCounts = {
    pass: 0,
    minor: 0,
    major: 0,
    na: 0,
    total: templateItemCount(pkg) + PAINT_PANELS.length,
    completed: 0,
  }

  for (const section of getScoredSections(pkg)) {
    const sectionState = checklist[section.id] ?? {}
    for (const item of section.items) {
      const status = effectiveStatus(sectionState[item.id]) // unset → 'pass'
      counts[status] += 1
      counts.completed += 1
    }
  }

  // Paint panels are checked points too: original (the default) → pass, else minor.
  const paintState = checklist[PAINT_SECTION_ID] ?? {}
  for (const panel of PAINT_PANELS) {
    const paint = paintState[panel.id]?.paint ?? 'original'
    counts.completed += 1
    if (paint === 'original') counts.pass += 1
    else counts.minor += 1
  }
  return counts
}

/**
 * Build a fresh checklist with every scored item pre-marked Pass and every
 * exterior paint panel set to Original (brief item 4). Seeded into new reports at
 * creation so the inspector only flips the items that fail. Endoscopic evidence
 * (unscored, Premium-only) is left empty.
 */
export function seedDefaultChecklist(pkg: PackageType): ChecklistData {
  const checklist: ChecklistData = {}
  for (const section of getScoredSections(pkg)) {
    const sectionState: Record<string, ChecklistItemState> = {}
    for (const item of section.items) {
      sectionState[item.id] =
        section.kind === 'accident'
          ? { status: 'pass', comment: generateAccidentComment(null) }
          : { status: 'pass' }
    }
    checklist[section.id] = sectionState
  }
  const paint: Record<string, ChecklistItemState> = {}
  for (const panel of PAINT_PANELS) paint[panel.id] = { paint: 'original' }
  checklist[PAINT_SECTION_ID] = paint
  return checklist
}

/** Completion percentage (0–100) based on items with a status set. */
export function completionPercent(counts: ReportCounts): number {
  if (!counts.total) return 0
  return Math.round((counts.completed / counts.total) * 100)
}

// ─── Section & overall scoring (brief sections 8 & 9) ──────────────────────

/**
 * Stored item-states for a section, limited to items STILL in the template.
 * Older reports keep checklist keys for checks that were later removed (e.g. the
 * old 5-row Accident History); counting those orphans made headers show nonsense
 * like "5/1" and skewed scores. Filtering by the current template fixes every
 * count/score without a data migration. Sections not in the library (the paint
 * map) fall through to all states.
 */
function liveSectionStates(
  sectionId: string | undefined,
  sectionState: Record<string, ChecklistItemState>,
): ChecklistItemState[] {
  const def = sectionId ? getSection(sectionId) : undefined
  if (!def) return Object.values(sectionState)
  const out: ChecklistItemState[] = []
  for (const item of def.items) {
    const s = sectionState[item.id]
    if (s) out.push(s)
  }
  return out
}

/** Total point deductions within a section's stored state. Accident History uses
 *  its own heavier deduction scale (pass sectionId so the override applies). */
export function sectionDeductions(
  sectionState?: Record<string, ChecklistItemState>,
  sectionId?: string,
): number {
  if (!sectionState) return 0
  const accident = sectionId === ACCIDENT_SECTION_ID
  const minor = accident ? ACCIDENT_MINOR_DEDUCTION : MINOR_DEDUCTION
  const major = accident ? ACCIDENT_MAJOR_DEDUCTION : MAJOR_DEDUCTION
  let d = 0
  for (const state of liveSectionStates(sectionId, sectionState)) {
    const status = itemStatus(state)
    if (status === 'minor') d += minor
    else if (status === 'major') d += major
  }
  return d
}

/** Section score out of 100 (floored at 0). Pass sectionId for Accident History. */
export function sectionScore(
  sectionState?: Record<string, ChecklistItemState>,
  sectionId?: string,
): number {
  return Math.max(0, 100 - sectionDeductions(sectionState, sectionId))
}

export interface SectionScore {
  id: string
  title: string
  weight: number
  score: number
  graded: number
}

/** Per-section scores for the executive summary cards (present scored sections). */
export function sectionScores(pkg: PackageType, checklist: ChecklistData): SectionScore[] {
  const out: SectionScore[] = []
  for (const section of getScoredSections(pkg)) {
    const sectionState = checklist[section.id] || {}
    let graded = 0
    for (const item of section.items) {
      // Default-pass: an untouched item counts as a graded Pass (effectiveStatus),
      // mirroring computeCounts/sectionCounts — so a legacy/unseeded report scores
      // coherently instead of reading "Not graded". Only an EXPLICIT 'na' is
      // excluded (it deducts nothing; counting it would let an all-N/A section read
      // as a free 100), keeping such a section out of the weighted overallScore.
      const status = effectiveStatus(sectionState[item.id])
      if (status !== 'na') graded += 1
    }
    let score = sectionScore(sectionState, section.id)
    // Exterior also carries the paint-panel deductions, and the panels count as
    // graded so a panels-only exterior still contributes to the overall score.
    if (section.id === 'exterior') {
      score = Math.max(0, score - paintDeductionsFor(checklist[PAINT_SECTION_ID]))
      graded += assessedPaintPanels(checklist)
    }
    out.push({
      id: section.id,
      title: section.title,
      weight: section.weight ?? 0,
      score,
      graded,
    })
  }
  return out
}

/**
 * Weighted overall "Crescent Score" (0–100). Weights are the brief's; the
 * average is taken over scored sections that have at least one graded item, with
 * the weights re-normalised so they always sum to 1. This makes the full
 * Comprehensive/Premium report match the brief's table exactly, while Standard
 * (fewer sections) and partially-filled reports still score sensibly. Returns
 * null when nothing has been graded.
 */
export function overallScore(pkg: PackageType, checklist: ChecklistData): number | null {
  const scores = sectionScores(pkg, checklist).filter((s) => s.graded > 0 && s.weight > 0)
  const totalWeight = scores.reduce((sum, s) => sum + s.weight, 0)
  if (totalWeight === 0) return null
  const weighted = scores.reduce((sum, s) => sum + s.score * s.weight, 0) / totalWeight
  return Math.round(weighted)
}

/** Recommendation suggested by the score (brief: 85+/65+/below). */
export function recommendationFromScore(score: number | null): BuyerRecommendation | null {
  if (score == null) return null
  if (score >= 85) return 'buy'
  if (score >= 65) return 'negotiate'
  return 'avoid'
}

/** Colour band for the score gauge / pie (green / amber / red). */
export function scoreBand(score: number | null): 'good' | 'caution' | 'high_risk' {
  if (score == null) return 'caution'
  if (score >= 85) return 'good'
  if (score >= 65) return 'caution'
  return 'high_risk'
}

// ─── Findings (derived from Major issues) ──────────────────────────────────

/**
 * Auto-derived findings: every scored item marked a Major Issue. Used for the
 * "key issues" call-out and kept in `critical_findings` for compatibility.
 */
export function deriveAutoFindings(
  pkg: PackageType,
  checklist: ChecklistData,
): CriticalFinding[] {
  const findings: CriticalFinding[] = []
  for (const section of getScoredSections(pkg)) {
    const sectionState = checklist[section.id]
    if (!sectionState) continue
    for (const item of section.items) {
      const state = sectionState[item.id]
      if (itemStatus(state) === 'major') {
        findings.push({
          id: `auto:${section.id}:${item.id}`,
          title: item.title,
          severity: 'major',
          description: itemComment(state),
          section: section.title,
          auto: true,
          sourceItemId: `${section.id}:${item.id}`,
          photo: state?.photos?.[0] ?? null,
          photos: state?.photos ?? [],
        })
      }
    }
  }
  return findings
}

/** Merge auto-derived findings with stored manual findings. */
export function mergeFindings(
  pkg: PackageType,
  checklist: ChecklistData,
  stored: CriticalFinding[],
): CriticalFinding[] {
  const auto = deriveAutoFindings(pkg, checklist)
  const manual = (stored || []).filter((f) => !f.auto)
  return [...auto, ...manual]
}

// ─── Display helpers ───────────────────────────────────────────────────────

export function vehicleTitle(
  r: Pick<InspectionReport, 'vehicle_make' | 'vehicle_model' | 'vehicle_year'>,
): string {
  return [r.vehicle_year, r.vehicle_make, r.vehicle_model].filter(Boolean).join(' ').trim() || 'Vehicle'
}

export const STATUS_BADGE_LABEL: Record<ReportStatus, string> = {
  draft: 'Draft',
  completed: 'Completed',
  archived: 'Archived',
}

/** Section-level status tally for the preview pages / editor headers.
 *  Default-pass: every current template item is counted, untouched ones as Pass
 *  (looking up by current item id inherently ignores orphaned legacy keys). */
export function sectionCounts(
  checklist: ChecklistData,
  sectionId: string,
): Record<ChecklistStatus, number> {
  const tally: Record<ChecklistStatus, number> = { pass: 0, minor: 0, major: 0, na: 0 }
  const sectionState = checklist[sectionId] ?? {}
  const def = getSection(sectionId)
  if (def) {
    for (const item of def.items) tally[effectiveStatus(sectionState[item.id])] += 1
  } else {
    // Non-library section (e.g. the paint map): tally only stored statuses.
    for (const state of Object.values(sectionState)) {
      const status = itemStatus(state)
      if (status) tally[status] += 1
    }
  }
  return tally
}

export interface SectionSummary {
  id: string
  title: string
  tally: Record<ChecklistStatus, number>
  graded: number
}

/**
 * Per-section roll-up across a package template, used by report summaries. Only
 * sections with at least one graded item are returned, in template order.
 */
export function sectionSummaries(pkg: PackageType, checklist: ChecklistData): SectionSummary[] {
  const out: SectionSummary[] = []
  for (const section of getTemplate(pkg).sections) {
    const tally = sectionCounts(checklist, section.id)
    const graded = tally.pass + tally.minor + tally.major + tally.na
    if (graded === 0) continue
    out.push({ id: section.id, title: section.title, tally, graded })
  }
  return out
}
