import type { InspectionReport } from './report-types'
import { getPackage, getTemplate } from './report-templates'
import { computeCounts, itemStatus, isIssue } from './report-utils'

export interface ValidationResult {
  ok: boolean
  errors: string[]
}

const TYRE_ITEMS = new Set(['tyre-fl', 'tyre-fr', 'tyre-rl', 'tyre-rr'])

/**
 * Validate that a report meets the "Mark Completed" requirements. The same rules
 * run client-side (to gate the button) and server-side (in the complete action).
 *
 * Brief rules enforced:
 *   • Every Minor / Major issue needs at least one evidence photo (incl. the
 *     endoscopic evidence section; Accident History is exempt — it's a records
 *     search, not a physical finding).
 *   • A custom issue (Minor/Major with no common fault selected) needs a note.
 *   • Tyre items, once graded, need manufacturer, date code and a photo.
 *   • Recommendation + inspector notes are required where the package enables them.
 */
export function validateForCompletion(report: InspectionReport): ValidationResult {
  const errors: string[] = []
  const pkg = getPackage(report.package_type)

  if (!report.package_type) errors.push('Package must be selected.')
  // All vehicle-detail fields are mandatory before a report can be completed.
  if (!report.vehicle_make?.trim()) errors.push('Vehicle make is required.')
  if (!report.vehicle_model?.trim()) errors.push('Vehicle model is required.')
  if (!report.vehicle_year?.trim()) errors.push('Vehicle year is required.')
  if (!report.vin?.trim()) errors.push('VIN / chassis number is required.')
  if (!report.plate_number?.trim()) errors.push('Plate number is required.')
  if (!report.odometer?.trim()) errors.push('Odometer is required.')
  if (!report.regional_specs?.trim()) errors.push('Regional specs are required.')
  if (!report.transmission?.trim()) errors.push('Transmission is required.')
  if (!report.fuel_type?.trim()) errors.push('Fuel type is required.')
  if (!report.engine_size?.trim()) errors.push('Engine size is required.')
  if (!report.exterior_colour?.trim()) errors.push('Exterior colour is required.')
  if (!report.inspection_location?.trim()) errors.push('Inspection location is required.')
  if (!report.inspection_date) errors.push('Inspection date is required.')
  if (!report.inspection_time?.trim()) errors.push('Inspection time is required.')

  const checklist = report.checklist || {}
  const counts = computeCounts(report.package_type, checklist)
  if (counts.completed === 0) errors.push('Complete at least some inspection items.')

  // Per-item evidence rules. Iterate the full template (scored sections + the
  // unscored endoscopic evidence section) so endoscopic findings are enforced too.
  let missingPhotos = 0
  let missingNotes = 0
  const tyreGaps: string[] = []
  for (const section of getTemplate(report.package_type).sections) {
    const sectionState = checklist[section.id] || {}
    // Accident History is a records search — a Minor/Major result needs a detail
    // (preset/note) but not a photo.
    const photoExempt = section.kind === 'accident'
    for (const item of section.items) {
      const state = sectionState[item.id]
      const status = itemStatus(state)
      if (!status) continue
      const photos = state?.photos ?? []
      if (isIssue(status)) {
        if (!photoExempt && photos.length === 0) missingPhotos += 1
        // A custom issue (no common fault) must carry a hand-written note — the
        // auto-generated comment does not count, so we check the manual flag /
        // inspector note rather than itemComment().
        const hasIssueDetail =
          (state?.commonIssues?.length ?? 0) > 0 ||
          state?.commentManual === true ||
          (state?.notes?.trim().length ?? 0) > 0
        if (!hasIssueDetail) missingNotes += 1
      }
      if (TYRE_ITEMS.has(item.id)) {
        if (!state?.tyreManufacturer?.trim() || !state?.tyreDate?.trim() || photos.length === 0) {
          tyreGaps.push(item.title)
        }
      }
    }
  }
  if (missingPhotos > 0) {
    errors.push(
      `${missingPhotos} issue${missingPhotos > 1 ? 's' : ''} need at least one evidence photo.`,
    )
  }
  if (missingNotes > 0) {
    errors.push(
      `${missingNotes} issue${missingNotes > 1 ? 's' : ''} need a selected fault or a note.`,
    )
  }
  if (tyreGaps.length > 0) {
    errors.push('Tyre manufacturer, date code and a photo are required for each graded tyre.')
  }

  if (pkg.recommendationEnabled) {
    if (!report.buyer_recommendation) errors.push('Buyer recommendation is required for this package.')
    if (!report.inspector_summary?.trim()) errors.push('Inspector notes are required for this package.')
  }

  return { ok: errors.length === 0, errors }
}

// ─── Server input validation helpers ───────────────────────────────────────

const PHONE_RE = /^[+0-9()\-\s]{6,20}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim())
}

export function isValidPhone(phone: string): boolean {
  return PHONE_RE.test(phone.trim())
}

/** Trim + cap a free-text field; returns null for empty. */
export function cleanText(value: unknown, max = 2000): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, max)
}
