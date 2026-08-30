import type { InspectionReport, ReportBrand } from './report-types'

// ════════════════════════════════════════════════════════════════════════
// Report brand identities (migration 022).
//
// A report carries an inspection (package_type) and an identity (report_brand).
// The two are independent: Alpha Worldwide sell the Premium inspection under
// their own name, so an Alpha report is package_type 'premium' + brand 'alpha'.
//
// Everything brand-specific about the customer-facing document lives here, so
// adding a third reseller later is a new entry in BRANDS plus its cover page —
// not a hunt through the page components.
//
// Interaction with hide_branding (migration 021): white-label means "no
// identity at all", so it still wins. An Alpha report with hide_branding on
// renders the neutral document, not the Alpha one.
// ════════════════════════════════════════════════════════════════════════

/**
 * Only the brand facts that page components read from the REPORT live here.
 *
 * The visual chrome — logo lockup, watermark, domain line, header palette —
 * deliberately does not: DocHeader / DocFooter / DocPage are called from a
 * dozen pages that never receive the report, so those swap by CSS class off
 * the document root (`.report-doc--alpha`, see app/globals.css) instead. Adding
 * a `logo` field here would look load-bearing and never be read.
 */
export interface BrandConfig {
  id: ReportBrand
  /** Company name as it appears in body copy and the disclaimer text. */
  name: string
  /** Name this brand gives the overall score. */
  scoreName: string
  /**
   * Whether the document ends with the legal-disclaimer page. Alpha asked for
   * it off: the text names the inspection provider throughout and their legal
   * position is their own to state, not ours to assume.
   */
  disclaimerPage: boolean
}

export const BRANDS: Record<ReportBrand, BrandConfig> = {
  crescent: {
    id: 'crescent',
    name: 'Crescent Car Check',
    scoreName: 'Crescent Score',
    disclaimerPage: true,
  },
  alpha: {
    id: 'alpha',
    name: 'Alpha Worldwide',
    // Not "Crescent Score" — the customer holding an Alpha report has never
    // heard of Crescent, and naming it after them would be the one leak that
    // undoes the rest of the brand swap.
    scoreName: 'Overall Score',
    disclaimerPage: false,
  },
}

/**
 * The brand a report is rendered in.
 *
 * Defensive on two axes, both of which happen in practice:
 *   • the column is absent (row read by an app deployed ahead of migration 022,
 *     or an older local-storage draft) → 'crescent', today's document;
 *   • the value is unrecognised (a brand rolled back in code but not in data)
 *     → 'crescent', rather than rendering a document with no chrome at all.
 */
export function reportBrand(report: Pick<InspectionReport, 'report_brand'>): ReportBrand {
  const value = report.report_brand
  return value === 'alpha' ? 'alpha' : 'crescent'
}

export function brandConfig(report: Pick<InspectionReport, 'report_brand'>): BrandConfig {
  return BRANDS[reportBrand(report)]
}

/**
 * The brand the document is ACTUALLY rendered in, with white-label applied:
 * hide_branding wins over any brand ("show no identity" beats "show theirs"),
 * falling back to the neutral crescent chrome. Use this — not reportBrand() —
 * wherever layout depends on which header/chrome really renders (pagination
 * budgets); ReportDocument makes the same call for the visual swap.
 */
export function effectiveBrand(
  report: Pick<InspectionReport, 'report_brand' | 'hide_branding'>,
): ReportBrand {
  return report.hide_branding ? 'crescent' : reportBrand(report)
}

export const VALID_BRANDS: ReportBrand[] = ['crescent', 'alpha']
