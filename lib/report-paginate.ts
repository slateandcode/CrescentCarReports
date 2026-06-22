import type { ChecklistItemState, PhotoRef } from './report-types'
import { itemComment, itemNote } from './report-utils'

/**
 * Deterministic, DOM-free pagination for the printable report.
 *
 * The report renders to PDF in one headless-Chromium shot (and to the on-screen
 * preview with the same components), so we cannot measure the DOM to decide page
 * breaks. Instead we estimate each content block's height in millimetres and
 * greedily pack blocks into A4-sized chunks. Each chunk becomes one <DocPage>, so
 * a long section flows onto "(continued)" pages instead of overflowing a single
 * fixed-height sheet (which would clip) — see app/globals.css `.report-page`.
 *
 * The estimates are intentionally a little generous and the budgets sit a little
 * under a true A4 sheet, so estimation error trims a sliver of whitespace rather
 * than spilling a block onto a blank page. Calibrate the constants against a real
 * render if breaks land in the wrong place.
 */

// ─── Page budgets (mm) ──────────────────────────────────────────────────────
// Calibrated against real headless-Chrome renders (see _verify): the goal is
// pages that fill ~80% without ever overflowing the fixed-height sheet (overflow
// clips; under-fill just adds a page, so estimates sit a touch above reality).
const PAGE_MM = 297 // A4 height
const HEADER_MM = 16 // DocHeader band (logo row + gold rule)
const FOOTER_MM = 12 // DocFooter (absolute, bottom of the sheet)
const PAD_MM = 22 // content wrapper px-12 pt-9 pb-14 vertical padding + slack
const TITLE_MM = 12 // DocSectionTitle row
const SCORE_HEADER_MM = 24 // SectionScoreHeader pill + tally (first page only)
const SAFETY_MM = 4 // keep each budget just under the sheet

/** Usable height on the first page of a scored section (title + score header). */
export const SECTION_FIRST_MM =
  PAGE_MM - HEADER_MM - FOOTER_MM - PAD_MM - TITLE_MM - SCORE_HEADER_MM - SAFETY_MM
/** Usable height on a "(continued)" page (title, no score header). */
export const SECTION_CONT_MM = PAGE_MM - HEADER_MM - FOOTER_MM - PAD_MM - TITLE_MM - SAFETY_MM

/** Photo-gallery pages have no score header, so the first page gets the cont budget. */
export const GALLERY_FIRST_MM = SECTION_CONT_MM
export const GALLERY_CONT_MM = SECTION_CONT_MM

/** A "Checks passed" list reopens its bordered header each page it appears on. */
const PASSLIST_HEADER_MM = 12
/** One row of the 3-up photo gallery grid (aspect-4/3 frame + caption + gap). */
const GALLERY_ROW_MM = 54

// ─── Block model ────────────────────────────────────────────────────────────
export type SectionBlock =
  | { kind: 'issue'; title: string; state: ChecklistItemState }
  | { kind: 'evidence'; title: string; state: ChecklistItemState }
  | { kind: 'pass'; title: string }

/** Build the ordered block list for a scored section (issues → evidence → passes). */
export function buildSectionBlocks(input: {
  issues: { title: string; state: ChecklistItemState }[]
  passEvidence: { title: string; state: ChecklistItemState }[]
  passes: string[]
}): SectionBlock[] {
  return [
    ...input.issues.map((i): SectionBlock => ({ kind: 'issue', title: i.title, state: i.state })),
    ...input.passEvidence.map((i): SectionBlock => ({ kind: 'evidence', title: i.title, state: i.state })),
    ...input.passes.map((t): SectionBlock => ({ kind: 'pass', title: t })),
  ]
}

/** Group a chunk's blocks back into the three render buckets, order preserved. */
export function splitChunk(chunk: SectionBlock[]) {
  const issues: { title: string; state: ChecklistItemState }[] = []
  const evidence: { title: string; state: ChecklistItemState }[] = []
  const passes: string[] = []
  for (const b of chunk) {
    if (b.kind === 'issue') issues.push({ title: b.title, state: b.state })
    else if (b.kind === 'evidence') evidence.push({ title: b.title, state: b.state })
    else passes.push(b.title)
  }
  return { issues, evidence, passes }
}

// ─── Height estimators (mm) ─────────────────────────────────────────────────
/** Photo rows inside a card. ItemPhotos lays w-32 frames ~4 across the content
 *  column; each row ≈ the h-24 frame (~26mm) + caption/gap. */
export function photoRowsMm(count: number | undefined): number {
  if (!count) return 0
  return Math.ceil(count / 4) * 28
}

function textMm(text: string, perLineChars: number): number {
  if (!text) return 0
  return Math.ceil(text.length / perLineChars) * 4.5
}

/** Estimated rendered height of one section block, in mm. */
export function blockMm(b: SectionBlock): number {
  if (b.kind === 'issue') {
    let h = 16 // card chrome: icon + title row + status badge + p-4
    if (b.state.affectedArea) h += 4
    if ((b.state.commonIssues?.length ?? 0) > 0) h += 6
    h += textMm(itemComment(b.state), 88)
    if (itemNote(b.state)) h += 4 + textMm(itemNote(b.state), 88)
    h += photoRowsMm(b.state.photos?.length)
    return h + 4 // gap below the card
  }
  if (b.kind === 'evidence') {
    let h = 12 // compact card chrome
    h += textMm(itemComment(b.state), 88)
    h += photoRowsMm(b.state.photos?.length)
    return h + 4
  }
  return 9 // one pass row
}

// ─── Greedy packers ─────────────────────────────────────────────────────────
/**
 * Pack section blocks into page-sized chunks. `leadMm` is fixed first-page
 * content (e.g. an info callout) that eats into the first page's budget. A single
 * block taller than a whole page still gets its own page (the fixed-height clip is
 * the final safety net for that rare case).
 */
export function paginateSectionBlocks(
  blocks: SectionBlock[],
  opts: { firstMm?: number; contMm?: number; leadMm?: number } = {},
): SectionBlock[][] {
  const firstMm = (opts.firstMm ?? SECTION_FIRST_MM) - (opts.leadMm ?? 0)
  const contMm = opts.contMm ?? SECTION_CONT_MM
  const chunks: SectionBlock[][] = []
  let cur: SectionBlock[] = []
  let remaining = firstMm
  let chunkHasPass = false

  for (const block of blocks) {
    const base = blockMm(block)
    let h = base + (block.kind === 'pass' && !chunkHasPass ? PASSLIST_HEADER_MM : 0)
    if (h > remaining && cur.length > 0) {
      chunks.push(cur)
      cur = []
      remaining = contMm
      chunkHasPass = false
      h = base + (block.kind === 'pass' ? PASSLIST_HEADER_MM : 0)
    }
    cur.push(block)
    if (block.kind === 'pass') chunkHasPass = true
    remaining -= h
  }
  if (cur.length) chunks.push(cur)
  return chunks.length ? chunks : [[]]
}

// ─── Free-text notes (Final Recommendation page) ────────────────────────────
export interface NotePage {
  /** Callout runs to render on this page (a note split across pages yields a run per page). */
  runs: { title?: string; text: string }[]
  /** Whether the "report issued" box lands on this page. */
  issued: boolean
}

/**
 * Paginate the inspector's free-text notes so an arbitrarily long summary flows
 * across "(continued)" pages instead of clipping. Paragraphs (blank-line
 * separated) are the unit of packing; consecutive paragraphs of the same note are
 * re-joined into one Callout per page. The "report issued" box is packed as a
 * trailing block so it falls onto its own page only when it would not fit.
 */
export function paginateNotes(
  notes: { title: string; body: string }[],
  opts: { firstMm: number; contMm: number; issuedMm: number },
): NotePage[] {
  const ISSUED = -2
  type B = { note: number; title?: string; text: string; mm: number }
  const blocks: B[] = []
  notes.forEach((n, ni) => {
    const paras = n.body.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean)
    paras.forEach((p, pi) => {
      const lines = Math.max(1, Math.ceil(p.length / 92))
      blocks.push({ note: ni, title: pi === 0 ? n.title : undefined, text: p, mm: lines * 5 + 3 + (pi === 0 ? 10 : 0) })
    })
  })
  blocks.push({ note: ISSUED, text: '', mm: opts.issuedMm })

  const pages: B[][] = []
  let cur: B[] = []
  let rem = opts.firstMm
  for (const b of blocks) {
    if (b.mm > rem && cur.length > 0) {
      pages.push(cur)
      cur = []
      rem = opts.contMm
    }
    cur.push(b)
    rem -= b.mm
  }
  if (cur.length) pages.push(cur)

  return pages.map((page) => {
    const runs: { title?: string; text: string }[] = []
    let issued = false
    let prevNote = -99
    for (const b of page) {
      if (b.note === ISSUED) {
        issued = true
        continue
      }
      if (b.note === prevNote && runs.length > 0) runs[runs.length - 1].text += '\n\n' + b.text
      else {
        runs.push({ title: b.title, text: b.text })
        prevNote = b.note
      }
    }
    return { runs, issued }
  })
}

/** Pack gallery photos into page-sized chunks (3-up grid, row-based). */
export function paginatePhotos(
  photos: PhotoRef[],
  opts: { firstMm?: number; contMm?: number; leadMm?: number } = {},
): PhotoRef[][] {
  const firstMm = (opts.firstMm ?? GALLERY_FIRST_MM) - (opts.leadMm ?? 0)
  const contMm = opts.contMm ?? GALLERY_CONT_MM
  const firstCount = Math.max(3, Math.floor(firstMm / GALLERY_ROW_MM) * 3)
  const contCount = Math.max(3, Math.floor(contMm / GALLERY_ROW_MM) * 3)
  if (photos.length === 0) return []
  const chunks: PhotoRef[][] = [photos.slice(0, firstCount)]
  for (let i = firstCount; i < photos.length; i += contCount) {
    chunks.push(photos.slice(i, i + contCount))
  }
  return chunks
}
