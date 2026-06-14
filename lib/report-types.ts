// ════════════════════════════════════════════════════════════════════════
// Shared report domain types. These mirror the inspection_reports columns and
// the JSON shapes stored in checklist / critical_findings / photos / counts.
//
// V4 (Crescent Car Check Report Brief) status model:
//   • Inspector-facing statuses are Pass / Minor Issue / Major Issue (+ an
//     optional internal N/A). The stored canonical values are
//     'pass' | 'minor' | 'major' | 'na'.
//   • Legacy reports stored 'attention' / 'fail' — these are accepted on read
//     and normalised (attention → minor, fail → major) by `normalizeStatus`.
// ════════════════════════════════════════════════════════════════════════

export type PackageType = 'standard' | 'comprehensive' | 'premium'
export type ReportStatus = 'draft' | 'completed' | 'archived'

/** Canonical inspection statuses (brief: Pass / Minor Issue / Major Issue). */
export type ChecklistStatus = 'pass' | 'minor' | 'major' | 'na'
/** Statuses only present in legacy stored data. */
export type LegacyChecklistStatus = 'attention' | 'fail'
/** Anything that may appear in stored `checklist` JSON. */
export type AnyChecklistStatus = ChecklistStatus | LegacyChecklistStatus

export type Severity = 'minor' | 'moderate' | 'major'
export type OverallCondition = 'good' | 'caution' | 'high_risk'

/** Buyer recommendation (brief: Buy / Negotiate / Avoid). Legacy: 'proceed'. */
export type BuyerRecommendation = 'buy' | 'negotiate' | 'avoid'
export type LegacyRecommendation = 'proceed'
export type AnyRecommendation = BuyerRecommendation | LegacyRecommendation

/** Paint condition recorded per exterior panel (brief section B). */
export type PaintCondition = 'original' | 'cosmetic' | 'repainted' | 'faded'

export type Role = 'admin' | 'inspector'

export interface PhotoRef {
  id: string
  url: string
  path: string
  caption?: string | null
  sectionId?: string | null
  itemId?: string | null
  /** How the photo sits in its report frame: crop to fill (default) or show the
   *  whole image letterboxed. Set by the inspector in the photo adjuster. */
  fit?: 'cover' | 'contain'
}

/**
 * State saved per checklist item, keyed by item id inside `checklist`.
 *
 * New (brief) fields:
 *   commonIssues  selected common-fault keys for a minor/major issue
 *   comment       customer-facing auto-comment (editable by the inspector)
 *   affectedArea  optional free-text area ("Rear bumper")
 *   paint         exterior-panel paint condition (only on the exterior-paint map)
 *   tyre*         per-corner tyre evidence (manufacturer / date code / tread)
 *
 * Legacy/compat fields:
 *   severity      old separate severity (minor|moderate|major)
 *   notes         old free-text note — still read as the inspector note
 */
export interface ChecklistItemState {
  status?: AnyChecklistStatus
  commonIssues?: string[]
  comment?: string
  /** True once the inspector hand-edits the comment (vs the auto-generated one). */
  commentManual?: boolean
  notes?: string
  affectedArea?: string
  photos?: PhotoRef[]
  paint?: PaintCondition
  tyreManufacturer?: string
  tyreDate?: string
  tread?: string
  severity?: Severity
}

/** `checklist` jsonb shape: { [sectionId]: { [itemId]: ChecklistItemState } } */
export type ChecklistData = Record<string, Record<string, ChecklistItemState>>

export interface CriticalFinding {
  id: string
  title: string
  severity: Severity
  description?: string
  section?: string
  /** When true this was auto-derived from a Major issue checklist item. */
  auto?: boolean
  sourceItemId?: string
  photo?: PhotoRef | null
  /** All evidence photos for this finding (auto findings inherit the item's). */
  photos?: PhotoRef[]
}

export interface ReportCounts {
  pass: number
  minor: number
  major: number
  na: number
  total: number // total scored checklist items in the template
  completed: number // items with any status set
}

export interface InspectorProfile {
  id: string
  full_name: string
  email: string
  phone: string | null
  role: Role
  status: 'active' | 'suspended'
  last_activity_at: string | null
  created_at: string
  updated_at: string
}

export interface InspectionReport {
  id: string
  report_reference: string
  public_id: string
  inspector_id: string | null
  status: ReportStatus
  package_type: PackageType

  customer_name: string | null
  customer_phone: string | null
  customer_email: string | null

  vehicle_make: string
  vehicle_model: string
  vehicle_year: string | null
  vin: string | null
  plate_number: string | null
  odometer: string | null
  regional_specs: string | null
  transmission: string | null
  fuel_type: string | null
  engine_size: string | null
  exterior_colour: string | null
  inspection_location: string | null
  inspection_date: string | null
  inspection_time: string | null
  main_vehicle_image_url: string | null

  overall_condition: OverallCondition | null
  buyer_recommendation: AnyRecommendation | null
  inspector_summary: string | null
  price_negotiation_notes: string | null

  checklist: ChecklistData
  critical_findings: CriticalFinding[]
  photos: PhotoRef[]
  counts: ReportCounts | Record<string, never>

  created_at: string
  updated_at: string
  completed_at: string | null
}

/** Report joined with its inspector (list/dashboard views). */
export interface ReportWithInspector extends InspectionReport {
  inspector?: Pick<InspectorProfile, 'id' | 'full_name'> | null
}
