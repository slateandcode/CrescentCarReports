import type {
  InspectionReport,
  InspectorProfile,
  PackageType,
  ChecklistData,
  ChecklistItemState,
} from './report-types'
import type { SessionUser } from './auth'
import { computeCounts, mergeFindings, seedDefaultChecklist } from './report-utils'
import { getTemplate } from './report-templates'
import { PAINT_SECTION_ID } from './issues'
import { generatePublicId } from './utils'

/**
 * Build a fully-graded checklist for a package: every scored item in every
 * section of the template is set to Pass, then `overrides` are layered on top.
 * This keeps the demo reports realistic and complete without hand-listing every
 * item. (Non-scored Endoscopic items are included too so the Premium evidence
 * page has content.)
 */
type ChecklistOverrides = Record<string, Record<string, ChecklistItemState>>
function fullChecklist(pkg: PackageType, overrides: ChecklistOverrides = {}): ChecklistData {
  const template = getTemplate(pkg)
  const checklist: ChecklistData = {}
  for (const section of template.sections) {
    checklist[section.id] = {}
    for (const item of section.items) {
      checklist[section.id][item.id] = overrides[section.id]?.[item.id] ?? { status: 'pass' }
    }
  }
  // Paint map is not a template section — merge it in if provided.
  if (overrides[PAINT_SECTION_ID]) checklist[PAINT_SECTION_ID] = overrides[PAINT_SECTION_ID]
  return checklist
}

// ════════════════════════════════════════════════════════════════════════
// In-memory demo backend. Active only when IS_DEMO is true.
// ════════════════════════════════════════════════════════════════════════

export const DEMO_PROFILE: InspectorProfile = {
  id: 'demo-inspector',
  full_name: 'Demo Inspector',
  email: 'demo@crescentcarchecks.com',
  phone: '+971 50 252 6314',
  role: 'admin',
  status: 'active',
  last_activity_at: new Date().toISOString(),
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: new Date().toISOString(),
}

export const DEMO_SESSION: SessionUser = {
  id: DEMO_PROFILE.id,
  email: DEMO_PROFILE.email,
  profile: DEMO_PROFILE,
}

function uuid(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return 'demo-' + Math.random().toString(36).slice(2)
}

function pad(n: number): string {
  return String(n).padStart(4, '0')
}
function refYear(ref: string): string {
  return ref.split('-')[1] || String(new Date().getFullYear())
}
function refSeq(ref: string): number {
  return parseInt(ref.split('-')[2] || '0', 10) || 0
}

function activeYear(map: Map<string, InspectionReport>): string {
  let year = String(new Date().getFullYear())
  for (const r of map.values()) {
    const y = refYear(r.report_reference)
    if (y > year) year = y
  }
  return year
}

function nextRef(): string {
  const map = store()
  const year = activeYear(map)
  let max = 0
  for (const r of map.values()) {
    if (refYear(r.report_reference) === year) max = Math.max(max, refSeq(r.report_reference))
  }
  return `CCR-${year}-${pad(max + 1)}`
}

function renumberReports(map: Map<string, InspectionReport>): void {
  const byYear = new Map<string, InspectionReport[]>()
  for (const r of map.values()) {
    const y = refYear(r.report_reference)
    if (!byYear.has(y)) byYear.set(y, [])
    byYear.get(y)!.push(r)
  }
  for (const [year, list] of byYear) {
    list.sort((a, b) => refSeq(a.report_reference) - refSeq(b.report_reference))
    list.forEach((r, i) => {
      r.report_reference = `CCR-${year}-${pad(i + 1)}`
    })
  }
}

function base(pkg: PackageType, ref: string): InspectionReport {
  const now = new Date().toISOString()
  return {
    id: uuid(),
    report_reference: ref,
    public_id: generatePublicId(),
    inspector_id: DEMO_PROFILE.id,
    status: 'draft',
    package_type: pkg,
    customer_name: null,
    customer_phone: null,
    customer_email: null,
    vehicle_make: '',
    vehicle_model: '',
    vehicle_year: null,
    vin: null,
    plate_number: null,
    odometer: null,
    regional_specs: null,
    transmission: null,
    fuel_type: null,
    engine_size: null,
    exterior_colour: null,
    inspection_location: null,
    inspection_date: null,
    inspection_time: null,
    main_vehicle_image_url: null,
    overall_condition: null,
    buyer_recommendation: null,
    inspector_summary: null,
    price_negotiation_notes: null,
    checklist: {},
    critical_findings: [],
    photos: [],
    counts: {},
    created_at: now,
    updated_at: now,
    completed_at: null,
  }
}

function sample(
  pkg: PackageType,
  ref: string,
  overrides: Partial<InspectionReport>,
  checklist: ChecklistData,
): InspectionReport {
  const r: InspectionReport = { ...base(pkg, ref), ...overrides, checklist }
  r.counts = computeCounts(pkg, checklist)
  r.critical_findings = mergeFindings(pkg, checklist, r.critical_findings)
  return r
}

function buildSeed(): Map<string, InspectionReport> {
  const map = new Map<string, InspectionReport>()

  // 1. Completed Premium — fully graded, realistic 600-point report.
  const premium = sample(
    'premium',
    'CCR-2026-0003',
    {
      status: 'completed',
      customer_name: 'Omar Al Farsi',
      customer_phone: '+971 50 123 4567',
      customer_email: 'omar@email.com',
      vehicle_make: 'Toyota',
      vehicle_model: 'Land Cruiser',
      vehicle_year: '2021',
      vin: 'JTMHV05J104112233',
      plate_number: 'Dubai A 12345',
      odometer: '82,000 km',
      regional_specs: 'GCC',
      transmission: 'Automatic',
      fuel_type: 'Petrol',
      engine_size: '4.0L V6',
      exterior_colour: 'Pearl White',
      inspection_location: 'Dubai',
      inspection_date: '2026-05-20',
      inspection_time: '11:00',
      buyer_recommendation: 'negotiate',
      inspector_summary:
        'Overall a well-kept example with full Toyota service history. The front-right fender shows a documented respray, consistent with a minor past repair — no filler or structural concern detected. The engine bay has a power-steering seal weeping, and the front tyres are near the wear limit. Nothing here is a deal-breaker, but the repaint, tyres and seal are fair points for negotiation.',
      price_negotiation_notes:
        'Budget ~AED 1,500 for two front tyres and ~AED 900 for the power-steering seal reseal. The documented front-right repaint should support a further AED 3,000–4,000 off the asking price.',
      completed_at: '2026-05-20T13:30:00.000Z',
      updated_at: '2026-05-20T13:30:00.000Z',
    },
    fullChecklist('premium', {
      exterior: {
        scratches: {
          status: 'minor',
          commonIssues: ['Scratches'],
          affectedArea: 'Rear bumper',
          comment:
            'Minor scratches were observed on the rear bumper. This appears cosmetic but may affect the vehicle’s value.',
        },
      },
      [PAINT_SECTION_ID]: {
        bonnet: { paint: 'original' },
        roof: { paint: 'original' },
        'front-left-fender': { paint: 'original' },
        'front-right-fender': { paint: 'repainted' },
        'front-left-door': { paint: 'original' },
        'front-right-door': { paint: 'original' },
        'rear-left-door': { paint: 'original' },
        'rear-right-door': { paint: 'original' },
        'rear-left-quarter': { paint: 'original' },
        'rear-right-quarter': { paint: 'original' },
        boot: { paint: 'original' },
        'front-bumper': { paint: 'cosmetic' },
        'rear-bumper': { paint: 'cosmetic' },
      },
      interior: {
        seats: {
          status: 'minor',
          commonIssues: ['Seat wear'],
          comment: "Light wear on the driver's bolster. Cosmetic and consistent with the mileage.",
        },
      },
      'tyres-brakes': {
        'tyre-fl': {
          status: 'minor',
          commonIssues: ['Low tread'],
          tyreManufacturer: 'Michelin',
          tyreDate: '0419',
          tread: '3.1 mm',
          comment: 'Front-left tyre tread is near the wear limit and replacement is due soon.',
        },
        'tyre-fr': {
          status: 'minor',
          commonIssues: ['Low tread'],
          tyreManufacturer: 'Michelin',
          tyreDate: '0419',
          tread: '3.0 mm',
          comment: 'Front-right tyre tread is near the wear limit and replacement is due soon.',
        },
        'tyre-rl': { status: 'pass', tyreManufacturer: 'Michelin', tyreDate: '0420', tread: '6.2 mm' },
        'tyre-rr': { status: 'pass', tyreManufacturer: 'Michelin', tyreDate: '0420', tread: '6.4 mm' },
        'brake-pads': {
          status: 'minor',
          commonIssues: ['Brake pads low'],
          comment: 'Front brake pads are at roughly 40% and will be due within ~10,000 km.',
        },
      },
      'engine-bay': {
        'visible-fluid-leak': {
          status: 'major',
          commonIssues: ['Active oil leak'],
          comment:
            'A power-steering seal is weeping at the pump. Budget for a reseal and monitor the fluid level.',
        },
        'oil-leak': {
          status: 'minor',
          commonIssues: ['Minor oil seepage'],
          comment: 'Light, dry oil seepage around the valve cover — no active drip. Worth monitoring.',
        },
        'oil-condition': { status: 'pass' },
      },
      'underbody-transmission': {
        'underbody-rust': {
          status: 'minor',
          commonIssues: ['Surface rust'],
          comment: 'Light surface rust on the underbody, typical for the age — no structural concern.',
        },
      },
      'suspension-steering': {
        'road-test-steering': {
          status: 'minor',
          commonIssues: ['Pulling to one side'],
          comment: 'A very slight pull to the right was felt — consistent with the front tyre wear.',
        },
      },
      'electrical-obd': {
        'battery-health': {
          status: 'minor',
          commonIssues: ['Battery health low'],
          comment: 'Battery health tested slightly low. Functional now but worth budgeting for a replacement.',
        },
        'obd-extended': { status: 'pass', comment: 'No stored or pending fault codes; readiness monitors complete.' },
      },
      endoscopic: {
        'engine-endoscopic': { status: 'pass', comment: 'Engine endoscopic inspection clear — no oil residue or carbon build-up in the inspected areas.' },
        'underbody-endoscopic': { status: 'pass', comment: 'Underbody / hidden areas clear — no corrosion, moisture or concealed damage observed.' },
      },
    }),
  )
  map.set(premium.id, premium)

  // 2. Completed Comprehensive — fully graded, clean example.
  const comp = sample(
    'comprehensive',
    'CCR-2026-0002',
    {
      status: 'completed',
      customer_name: 'Sarah Haddad',
      customer_phone: '+971 55 987 6543',
      customer_email: 'sarah@email.com',
      vehicle_make: 'Nissan',
      vehicle_model: 'Patrol',
      vehicle_year: '2019',
      vin: 'JN1TANY62U0000111',
      plate_number: 'Sharjah 1 55421',
      odometer: '120,400 km',
      regional_specs: 'GCC',
      transmission: 'Automatic',
      fuel_type: 'Petrol',
      engine_size: '5.6L V8',
      exterior_colour: 'Black',
      inspection_location: 'Sharjah',
      inspection_date: '2026-06-02',
      inspection_time: '15:30',
      buyer_recommendation: 'buy',
      inspector_summary:
        'A strong, well-maintained Patrol with a clean, rust-free underbody and no fluid leaks. Test drive was faultless — smooth gearbox, straight braking and no warning lights. Wear is limited to light cosmetic marks and a slightly soft front tyre set. A confident buy at the right price.',
      completed_at: '2026-06-02T17:00:00.000Z',
      updated_at: '2026-06-02T17:00:00.000Z',
    },
    fullChecklist('comprehensive', {
      [PAINT_SECTION_ID]: {
        bonnet: { paint: 'original' },
        roof: { paint: 'original' },
        'front-left-door': { paint: 'original' },
        'front-right-door': { paint: 'original' },
        'rear-left-door': { paint: 'cosmetic' },
        'front-bumper': { paint: 'cosmetic' },
        'rear-bumper': { paint: 'cosmetic' },
      },
      interior: {
        seats: {
          status: 'minor',
          commonIssues: ['Seat wear'],
          comment: "Minor wear on the driver's seat base; leather otherwise in good order.",
        },
      },
      'tyres-brakes': {
        'tyre-fl': {
          status: 'minor',
          commonIssues: ['Low tread'],
          tyreManufacturer: 'Dunlop',
          tyreDate: '2120',
          tread: '4.0 mm',
          comment: 'Front-left tread getting low — replace within the next service.',
        },
        'tyre-fr': {
          status: 'minor',
          commonIssues: ['Low tread'],
          tyreManufacturer: 'Dunlop',
          tyreDate: '2120',
          tread: '4.1 mm',
          comment: 'Front-right tread getting low — replace within the next service.',
        },
        'tyre-rl': { status: 'pass', tyreManufacturer: 'Dunlop', tyreDate: '2120', tread: '6.0 mm' },
        'tyre-rr': { status: 'pass', tyreManufacturer: 'Dunlop', tyreDate: '2120', tread: '6.0 mm' },
      },
    }),
  )
  map.set(comp.id, comp)

  // 3. Completed Standard — fully graded entry-level report (no recommendation).
  const std = sample(
    'standard',
    'CCR-2026-0001',
    {
      status: 'completed',
      customer_name: 'Yousef Karim',
      customer_phone: '+971 52 446 7788',
      vehicle_make: 'Honda',
      vehicle_model: 'Accord',
      vehicle_year: '2018',
      vin: '1HGCV1F3XJA000222',
      plate_number: 'Dubai K 44219',
      odometer: '96,800 km',
      regional_specs: 'GCC',
      transmission: 'Automatic',
      fuel_type: 'Petrol',
      engine_size: '2.4L',
      exterior_colour: 'Silver',
      inspection_location: 'Dubai',
      inspection_date: '2026-06-05',
      inspection_time: '10:00',
      inspector_summary:
        'A tidy, honest Accord that performs as expected for the mileage. All core visual and functional checks passed, with only minor cosmetic wear and a slightly weak cooling reading to note. No accident history or paint irregularities found.',
      completed_at: '2026-06-05T11:15:00.000Z',
      updated_at: '2026-06-05T11:15:00.000Z',
    },
    fullChecklist('standard', {
      exterior: {
        scratches: {
          status: 'minor',
          commonIssues: ['Scratches'],
          affectedArea: 'Rear bumper',
          comment: 'A light scuff was observed on the rear bumper corner. Cosmetic only.',
        },
      },
      [PAINT_SECTION_ID]: {
        bonnet: { paint: 'original' },
        roof: { paint: 'original' },
        'front-left-door': { paint: 'original' },
        'front-right-door': { paint: 'original' },
        'rear-bumper': { paint: 'cosmetic' },
      },
      interior: {
        'ac-cooling': {
          status: 'minor',
          commonIssues: ['Weak AC cooling'],
          comment: 'AC cools well but the vent temperature is slightly high — a regas is recommended.',
        },
      },
      'tyres-brakes': {
        'tyre-fl': { status: 'pass', tyreManufacturer: 'Bridgestone', tyreDate: '0221', tread: '5.0 mm' },
        'tyre-fr': { status: 'pass', tyreManufacturer: 'Bridgestone', tyreDate: '0221', tread: '5.0 mm' },
        'tyre-rl': { status: 'pass', tyreManufacturer: 'Bridgestone', tyreDate: '0221', tread: '5.2 mm' },
        'tyre-rr': { status: 'pass', tyreManufacturer: 'Bridgestone', tyreDate: '0221', tread: '5.2 mm' },
      },
    }),
  )
  map.set(std.id, std)

  return map
}

// Persist across hot reloads in dev via globalThis. Bump on seed changes.
const SEED_VERSION = 'v3-brief-2'
const g = globalThis as unknown as { __ccrDemoVersion?: string; __ccrDemo?: Map<string, InspectionReport> }
function store(): Map<string, InspectionReport> {
  if (!g.__ccrDemo || g.__ccrDemoVersion !== SEED_VERSION) {
    g.__ccrDemo = buildSeed()
    g.__ccrDemoVersion = SEED_VERSION
  }
  return g.__ccrDemo
}

function sortByUpdated(list: InspectionReport[]): InspectionReport[] {
  return [...list].sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at))
}

export function demoListReports(): InspectionReport[] {
  return sortByUpdated([...store().values()])
}

export function demoGetReport(id: string): InspectionReport | null {
  return store().get(id) ?? null
}

export function demoCreateReport(pkg: PackageType): InspectionReport {
  // Default-pass (brief item 4): seed every check Pass / panel Original.
  const checklist = seedDefaultChecklist(pkg)
  const r = base(pkg, nextRef())
  r.checklist = checklist
  r.counts = computeCounts(pkg, checklist)
  store().set(r.id, r)
  return r
}

export function demoDeleteReport(id: string): boolean {
  const map = store()
  const existed = map.delete(id)
  if (existed) renumberReports(map)
  return existed
}

export function demoSaveReport(id: string, patch: Partial<InspectionReport>): InspectionReport | null {
  const current = store().get(id)
  if (!current) return null
  const next: InspectionReport = { ...current, ...patch, updated_at: new Date().toISOString() }
  next.counts = computeCounts(next.package_type, next.checklist || {})
  next.critical_findings = mergeFindings(next.package_type, next.checklist || {}, next.critical_findings || [])
  store().set(id, next)
  return next
}

export function demoSetStatus(id: string, status: InspectionReport['status']): void {
  const current = store().get(id)
  if (!current) return
  store().set(id, {
    ...current,
    status,
    completed_at: status === 'completed' ? new Date().toISOString() : current.completed_at,
    updated_at: new Date().toISOString(),
  })
}

export function demoStats() {
  const list = demoListReports()
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)
  return {
    total: list.length,
    draft: list.filter((r) => r.status === 'draft').length,
    completed: list.filter((r) => r.status === 'completed').length,
    thisMonth: list.filter((r) => new Date(r.created_at) >= startOfMonth).length,
  }
}
