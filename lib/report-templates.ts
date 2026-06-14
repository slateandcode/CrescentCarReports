import type { PackageType } from './report-types'

// ════════════════════════════════════════════════════════════════════════
// Package-driven inspection templates (Crescent Car Check Report Brief).
//
// The report skeleton is the brief's eight scored sections (+ an unscored
// Endoscopic evidence section for Premium). Every package shares this skeleton;
// packages differ by which ITEMS are visible (each item has a minimum tier) and
// therefore which sections appear at all.
//
//   • Standard  → core visible items only. Underbody/Transmission and
//                 Suspension/Steering have no standard items, so those whole
//                 sections do not appear (they are Comprehensive features).
//   • Comprehensive → adds OBD scan, battery health, full underbody,
//                 transmission, panel gaps, suspension/steering, test-drive
//                 derived items.
//   • Premium  → adds detailed engine bay, detailed fluid-leak, AC compressor,
//                 extended OBD, battery/electrical review and the Endoscopic
//                 evidence section.
//
// Section weights are the brief's (sum to 100% for a full Comprehensive/Premium
// report). For Standard, the overall score re-normalises over the sections that
// are actually present — see lib/report-utils.ts.
// ════════════════════════════════════════════════════════════════════════

const TIER_RANK: Record<PackageType, number> = {
  standard: 0,
  comprehensive: 1,
  premium: 2,
}

export type SectionKind = 'standard' | 'accident' | 'exterior' | 'tyres' | 'endoscopic'

export interface ChecklistItemDef {
  id: string
  title: string
  /** Optional inspector hint shown under the item. */
  hint?: string
  /** Minimum package this item appears in. Defaults to 'standard'. */
  tier?: PackageType
}

export interface SectionDef {
  id: string
  title: string
  description?: string
  items: ChecklistItemDef[]
  /** Scored sections carry a weight and contribute to the Crescent Score. */
  scored?: boolean
  weight?: number
  /** Drives specialised editor / report rendering. */
  kind?: SectionKind
}

export interface PackageConfig {
  id: PackageType
  name: string
  price: number
  pointLabel: string // "250+ point check"
  popular: boolean
  description: string
  /** Marketing feature bullets (mirrors the public site copy). */
  features: string[]
  /** Ordered section ids enabled for this package. */
  sectionIds: string[]
  // Report capability flags
  recommendationEnabled: boolean
  detailedPhotos: boolean
  underbodyEnabled: boolean
  testDriveEnabled: boolean
  transmissionEnabled: boolean
  endoscopicEnabled: boolean
  negotiationNotesEnabled: boolean
}

export interface ResolvedTemplate extends PackageConfig {
  sections: SectionDef[]
}

// ─── Master section library (brief report order) ─────────────────────────
const SECTION_LIBRARY: SectionDef[] = [
  {
    id: 'accident-history',
    title: 'Accident History Search',
    description: 'VIN / chassis accident-history search and reported records.',
    scored: true,
    weight: 9,
    kind: 'accident',
    // One main check, scored on its own scale (Pass 0 / Minor −30 / Major −100 —
    // see lib/report-utils.ts). The result is chosen from ACCIDENT_PRESETS.
    items: [{ id: 'accident-record', title: 'Accident record result' }],
  },
  {
    id: 'exterior',
    title: 'Exterior, Paint & Panel Alignment',
    description: 'Panel paint condition map plus scored exterior issues.',
    scored: true,
    weight: 10,
    kind: 'exterior',
    items: [
      { id: 'scratches', title: 'Scratches' },
      { id: 'dents', title: 'Dents' },
      { id: 'panel-gaps', title: 'Panel gaps / alignment issues', tier: 'comprehensive' },
    ],
  },
  {
    id: 'interior',
    title: 'Interior',
    description: 'Cabin condition, comfort and AC performance.',
    scored: true,
    weight: 10,
    items: [
      { id: 'seats', title: 'Seat condition' },
      { id: 'dashboard', title: 'Dashboard condition' },
      { id: 'steering-wheel', title: 'Steering wheel condition' },
      { id: 'gear-lever', title: 'Gear lever condition' },
      { id: 'roof-lining', title: 'Roof lining condition' },
      { id: 'door-cards', title: 'Door card / armrest condition' },
      { id: 'trunk-lining', title: 'Trunk lining condition' },
      { id: 'floor-mats', title: 'Floor mat condition' },
      { id: 'interior-trim', title: 'Interior trim condition' },
      { id: 'infotainment', title: 'Infotainment / control condition' },
      { id: 'ac-cooling', title: 'AC cooling performance' },
      { id: 'ac-vent', title: 'AC vent / control condition' },
      { id: 'ac-compressor', title: 'AC compressor check', tier: 'premium' },
    ],
  },
  {
    id: 'tyres-brakes',
    title: 'Tyres, Rims & Brakes',
    description: 'Per-corner tyres and rims plus visible brake condition.',
    scored: true,
    weight: 11,
    kind: 'tyres',
    items: [
      { id: 'tyre-fl', title: 'Front-left tyre condition' },
      { id: 'tyre-fr', title: 'Front-right tyre condition' },
      { id: 'tyre-rl', title: 'Rear-left tyre condition' },
      { id: 'tyre-rr', title: 'Rear-right tyre condition' },
      { id: 'rim-fl', title: 'Front-left rim condition' },
      { id: 'rim-fr', title: 'Front-right rim condition' },
      { id: 'rim-rl', title: 'Rear-left rim condition' },
      { id: 'rim-rr', title: 'Rear-right rim condition' },
      { id: 'brake-pads', title: 'Brake pad visual condition' },
      { id: 'brake-discs', title: 'Brake disc visual condition' },
      { id: 'brake-vibration', title: 'Brake vibration observation', tier: 'comprehensive' },
    ],
  },
  {
    id: 'engine-bay',
    title: 'Engine Bay & Fluid Leaks',
    description: 'Engine bay condition, fluids and visible leaks.',
    scored: true,
    weight: 20,
    items: [
      { id: 'engine-bay-visual', title: 'Engine bay visual inspection' },
      { id: 'engine-idle', title: 'Engine idle' },
      { id: 'oil-leak', title: 'Engine oil leaks' },
      { id: 'coolant-leak', title: 'Coolant leaks' },
      { id: 'oil-condition', title: 'Engine oil condition' },
      { id: 'coolant-condition', title: 'Coolant condition' },
      { id: 'oil-cap', title: 'Oil filler cap' },
      { id: 'coolant-cap', title: 'Coolant cap' },
      { id: 'visible-fluid-leak', title: 'Visible engine-related fluid leak' },
      { id: 'radiator', title: 'Radiator condition', tier: 'comprehensive' },
      { id: 'hoses', title: 'Hoses / pipes', tier: 'comprehensive' },
      { id: 'belts', title: 'Belts / pulleys', tier: 'comprehensive' },
      { id: 'engine-cover', title: 'Engine cover / shield condition', tier: 'comprehensive' },
      { id: 'exhaust-visible', title: 'Exhaust visible condition', tier: 'comprehensive' },
      { id: 'engine-mounts', title: 'Engine mounts', tier: 'premium' },
      { id: 'abnormal-noise', title: 'Abnormal engine noise', tier: 'premium' },
      { id: 'previous-repair', title: 'Previous engine repair signs', tier: 'premium' },
    ],
  },
  {
    id: 'underbody-transmission',
    title: 'Underbody & Transmission',
    description: 'Underbody condition and transmission behaviour.',
    scored: true,
    weight: 17,
    items: [
      { id: 'trans-underside', title: 'Transmission underside condition', tier: 'comprehensive' },
      { id: 'trans-fluid-leak', title: 'Transmission fluid leak', tier: 'comprehensive' },
      { id: 'trans-fluid-condition', title: 'Transmission fluid level / condition', tier: 'comprehensive' },
      { id: 'gear-selector', title: 'Gear selector', tier: 'comprehensive' },
      { id: 'gear-shifting', title: 'Gear shifting behaviour', tier: 'comprehensive' },
      { id: 'trans-noise', title: 'Transmission noise', tier: 'comprehensive' },
      { id: 'drivetrain-vibration', title: 'Drivetrain vibration / noise', tier: 'comprehensive' },
      { id: 'gear-shift-delay', title: 'Gear shift delay', tier: 'comprehensive' },
      { id: 'gear-slipping', title: 'Gear slipping', tier: 'comprehensive' },
      { id: 'underbody-rust', title: 'Underbody rust / corrosion', tier: 'comprehensive' },
      { id: 'underbody-scraping', title: 'Underbody scraping', tier: 'comprehensive' },
      { id: 'underbody-impact', title: 'Underbody impact damage', tier: 'comprehensive' },
      { id: 'undertray', title: 'Undertray condition', tier: 'comprehensive' },
      { id: 'exhaust-system', title: 'Exhaust system visual check', tier: 'comprehensive' },
      { id: 'previous-underbody-repair', title: 'Previous underbody repair signs', tier: 'comprehensive' },
    ],
  },
  {
    id: 'suspension-steering',
    title: 'Suspension & Steering',
    description: 'Handling, ride quality and steering components.',
    scored: true,
    weight: 10,
    items: [
      { id: 'front-suspension', title: 'Front suspension visual condition', tier: 'comprehensive' },
      { id: 'rear-suspension', title: 'Rear suspension visual condition', tier: 'comprehensive' },
      { id: 'suspension-bushes', title: 'Suspension bushes', tier: 'comprehensive' },
      { id: 'shock-absorbers', title: 'Shock absorbers', tier: 'comprehensive' },
      { id: 'suspension-boots', title: 'Suspension boots', tier: 'comprehensive' },
      { id: 'steering-components', title: 'Steering components', tier: 'comprehensive' },
      { id: 'steering-boots', title: 'Steering boots', tier: 'comprehensive' },
      { id: 'steering-vibration', title: 'Steering vibration', tier: 'comprehensive' },
      { id: 'pulling', title: 'Pulling to one side', tier: 'comprehensive' },
      { id: 'suspension-noise', title: 'Suspension noise', tier: 'comprehensive' },
      { id: 'steering-noise', title: 'Steering noise', tier: 'comprehensive' },
      { id: 'road-test-steering', title: 'Road-test steering feel', tier: 'comprehensive' },
    ],
  },
  {
    id: 'electrical-obd',
    title: 'Electrical, OBD, Battery & Lights',
    description: 'Diagnostics, battery, charging and exterior lighting.',
    scored: true,
    weight: 13,
    items: [
      { id: 'headlights', title: 'Headlights' },
      { id: 'brake-lights', title: 'Brake lights' },
      { id: 'indicators', title: 'Indicators / hazards' },
      { id: 'reverse-lights', title: 'Reverse lights' },
      { id: 'fog-lights', title: 'Fog lights' },
      { id: 'plate-lights', title: 'Number plate lights' },
      { id: 'wipers', title: 'Wipers' },
      { id: 'horn', title: 'Horn' },
      { id: 'dash-warning', title: 'Dashboard warning lights' },
      { id: 'obd-scan', title: 'OBD diagnostic scan', tier: 'comprehensive' },
      { id: 'check-engine', title: 'Check engine light', tier: 'comprehensive' },
      { id: 'abs-fault', title: 'ABS warning / fault', tier: 'comprehensive' },
      { id: 'airbag-srs', title: 'Airbag / SRS warning / fault', tier: 'comprehensive' },
      { id: 'battery-health', title: 'Battery health check', tier: 'comprehensive' },
      { id: 'charging-system', title: 'Charging system', tier: 'comprehensive' },
      { id: 'obd-extended', title: 'Extended OBD fault-code review', tier: 'premium', hint: 'Stored / pending codes and readiness monitors.' },
    ],
  },
  {
    id: 'endoscopic',
    title: 'Endoscopic Camera Evidence',
    description: 'Borescope inspection of hard-to-see areas (evidence only).',
    scored: false,
    kind: 'endoscopic',
    items: [
      { id: 'engine-endoscopic', title: 'Engine endoscopic inspection', tier: 'premium' },
      { id: 'underbody-endoscopic', title: 'Underbody / hidden area endoscopic inspection', tier: 'premium' },
    ],
  },
]

const SECTION_MAP: Record<string, SectionDef> = Object.fromEntries(
  SECTION_LIBRARY.map((s) => [s.id, s]),
)

/** Every package shares the same ordered skeleton; items filter by tier. */
const ALL_SECTION_IDS = SECTION_LIBRARY.map((s) => s.id)

// ─── Package configs ─────────────────────────────────────────────────────
export const PACKAGES: Record<PackageType, PackageConfig> = {
  standard: {
    id: 'standard',
    name: 'Standard',
    price: 249,
    pointLabel: '250+ point check',
    popular: false,
    description: 'Core visible checks for everyday used cars.',
    features: [
      'Accident history search',
      'Exterior, paint & panel condition',
      'Interior & AC condition',
      'Tyres, rims & brakes check',
      'Engine bay & basic fluid leak check',
      'Lights & basic electrical check',
    ],
    sectionIds: ALL_SECTION_IDS,
    recommendationEnabled: false,
    detailedPhotos: false,
    underbodyEnabled: false,
    testDriveEnabled: false,
    transmissionEnabled: false,
    endoscopicEnabled: false,
    negotiationNotesEnabled: false,
  },
  comprehensive: {
    id: 'comprehensive',
    name: 'Comprehensive',
    price: 349,
    pointLabel: '400+ point check',
    popular: true,
    description:
      'A more detailed inspection for buyers who want extra confidence before committing.',
    features: [
      'Everything in Standard, plus:',
      'OBD diagnostic scan',
      'Battery health check',
      'Full underbody inspection',
      'Transmission check',
      'Panel gaps check',
      'Suspension visual check',
      'Test Drive Observations',
      'Photos of visible faults',
      'Detailed photo report',
      'Buy / negotiate / avoid recommendation',
    ],
    sectionIds: ALL_SECTION_IDS,
    recommendationEnabled: true,
    detailedPhotos: true,
    underbodyEnabled: true,
    testDriveEnabled: true,
    transmissionEnabled: true,
    endoscopicEnabled: false,
    negotiationNotesEnabled: false,
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    price: 449,
    pointLabel: '600+ point check',
    popular: false,
    description:
      'Our most detailed inspection, for buyers who want the clearest picture before a high-value purchase.',
    features: [
      'Everything in Comprehensive, plus:',
      'AC compressor check',
      'Detailed engine bay inspection',
      'Detailed engine & fluid leak check',
      'Extended OBD fault-code review',
      'Battery & electrical system review',
      'Endoscopic camera check for hard-to-see areas',
      '20-minute inspector summary call',
      'Price negotiation notes',
    ],
    sectionIds: ALL_SECTION_IDS,
    recommendationEnabled: true,
    detailedPhotos: true,
    underbodyEnabled: true,
    testDriveEnabled: true,
    transmissionEnabled: true,
    endoscopicEnabled: true,
    negotiationNotesEnabled: true,
  },
}

export const PACKAGE_LIST: PackageConfig[] = [
  PACKAGES.standard,
  PACKAGES.comprehensive,
  PACKAGES.premium,
]

export function getPackage(pkg: PackageType): PackageConfig {
  return PACKAGES[pkg]
}

/** Items in a section visible at the given package tier. */
function itemsForTier(section: SectionDef, pkg: PackageType): ChecklistItemDef[] {
  const max = TIER_RANK[pkg]
  return section.items.filter((it) => TIER_RANK[it.tier ?? 'standard'] <= max)
}

/**
 * Package config resolved with its ordered section definitions. Items are
 * filtered to the package tier and sections with no visible items are dropped,
 * so a Standard report never shows empty Comprehensive/Premium sections.
 */
export function getTemplate(pkg: PackageType): ResolvedTemplate {
  const config = PACKAGES[pkg]
  const sections: SectionDef[] = []
  for (const id of config.sectionIds) {
    const base = SECTION_MAP[id]
    if (!base) continue
    const items = itemsForTier(base, pkg)
    if (items.length === 0) continue
    sections.push({ ...base, items })
  }
  return { ...config, sections }
}

/** Scored sections present for a package (in order). */
export function getScoredSections(pkg: PackageType): SectionDef[] {
  return getTemplate(pkg).sections.filter((s) => s.scored)
}

export function getSection(id: string): SectionDef | undefined {
  return SECTION_MAP[id]
}

export function isScoredSection(id: string): boolean {
  return Boolean(SECTION_MAP[id]?.scored)
}

/** Total number of SCORED checklist items in a package template. */
export function templateItemCount(pkg: PackageType): number {
  return getScoredSections(pkg).reduce((sum, s) => sum + s.items.length, 0)
}
