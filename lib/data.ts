import { createClient, createServiceClient } from '@/lib/supabase/server'
import { IS_DEMO } from '@/lib/env'
import { signReportPhotos } from '@/lib/photo-sign'
import type { InspectionReport, ReportStatus } from './report-types'

/**
 * Server-side report queries. RLS already scopes rows to the current inspector
 * (or all rows for admins), so these never need an explicit inspector filter.
 */

export async function getRecentReports(limit = 5): Promise<InspectionReport[]> {
  if (IS_DEMO) {
    const { demoListReports } = await import('@/lib/demo')
    return demoListReports().slice(0, limit)
  }
  const supabase = await createClient()
  const { data } = await supabase
    .from('inspection_reports')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(limit)
  return (data as InspectionReport[]) || []
}

export interface DashboardStats {
  total: number
  draft: number
  completed: number
  thisMonth: number
}

export async function getDashboardStats(): Promise<DashboardStats> {
  if (IS_DEMO) {
    const { demoStats } = await import('@/lib/demo')
    return demoStats()
  }
  const supabase = await createClient()
  // Month boundary in Asia/Dubai (UTC+4, no DST), NOT server-local: Netlify runs
  // in UTC, so a local boundary mis-buckets reports created in the first hours of
  // the 1st (Dubai). Mirrors the timezone handling in lib/bookings-data.ts.
  const dubaiDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai' }).format(new Date())
  const startOfMonthISO = `${dubaiDate.slice(0, 7)}-01T00:00:00+04:00`

  const [total, draft, completed, thisMonth] = await Promise.all([
    supabase.from('inspection_reports').select('id', { count: 'exact', head: true }),
    supabase.from('inspection_reports').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
    supabase.from('inspection_reports').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
    supabase
      .from('inspection_reports')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', startOfMonthISO),
  ])

  return {
    total: total.count || 0,
    draft: draft.count || 0,
    completed: completed.count || 0,
    thisMonth: thisMonth.count || 0,
  }
}

export interface ReportFilters {
  search?: string
  status?: ReportStatus | 'all'
  pkg?: 'standard' | 'comprehensive' | 'premium' | 'all'
  sort?: 'updated' | 'newest' | 'oldest'
}

export async function getReports(filters: ReportFilters): Promise<InspectionReport[]> {
  if (IS_DEMO) {
    const { demoListReports } = await import('@/lib/demo')
    let list = demoListReports()
    if (filters.status && filters.status !== 'all') list = list.filter((r) => r.status === filters.status)
    if (filters.pkg && filters.pkg !== 'all') list = list.filter((r) => r.package_type === filters.pkg)
    if (filters.search?.trim()) {
      const s = filters.search.trim().toLowerCase()
      list = list.filter((r) =>
        [
          r.report_reference,
          r.customer_name,
          r.customer_phone,
          r.vehicle_make,
          r.vehicle_model,
          r.plate_number,
          r.vin,
        ]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(s)),
      )
    }
    if (filters.sort === 'newest') list = [...list].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
    else if (filters.sort === 'oldest') list = [...list].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))
    return list
  }
  const supabase = await createClient()
  // List cards only need these scalar columns — selecting '*' pulled the heavy
  // per-row `checklist` / `critical_findings` / `photos` JSON for up to 200 rows,
  // which dominated the reports-page payload and load time. (Filters below still
  // query other columns server-side; they don't need to be selected.)
  let query = supabase
    .from('inspection_reports')
    .select(
      'id, report_reference, status, package_type, customer_name, plate_number, vehicle_make, vehicle_model, vehicle_year, created_at, updated_at',
    )

  if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status)
  }
  if (filters.pkg && filters.pkg !== 'all') {
    query = query.eq('package_type', filters.pkg)
  }
  if (filters.search?.trim()) {
    // Strip PostgREST-reserved characters before interpolating into the .or()
    // filter: a comma splits the condition list and parens/quotes/backslash break
    // value parsing, so a term containing any of them (e.g. a name like
    // "Smith, John") would otherwise 400 and the search would silently return
    // nothing. Collapse the leftover whitespace so the ilike still matches.
    // Then escape the LIKE wildcards % and _ (they are literal here, not patterns):
    // a term like "50%" or "AB_12" should match those exact characters, not act as
    // a broad wildcard. RLS still scopes rows — this is correctness only.
    const s = filters.search
      .trim()
      .replace(/[,()"\\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[%_]/g, (m) => '\\' + m)
    if (s) {
      // ilike across the searchable text columns.
      const cols = [
        'report_reference',
        'customer_name',
        'customer_phone',
        'vehicle_make',
        'vehicle_model',
        'plate_number',
        'vin',
      ]
      query = query.or(cols.map((c) => `${c}.ilike.%${s}%`).join(','))
    }
  }

  switch (filters.sort) {
    case 'newest':
      query = query.order('created_at', { ascending: false })
      break
    case 'oldest':
      query = query.order('created_at', { ascending: true })
      break
    default:
      query = query.order('updated_at', { ascending: false })
  }

  const { data, error } = await query.limit(200)
  if (error) {
    console.error('[getReports] query failed', error)
    return []
  }
  return (data as InspectionReport[]) || []
}

export async function getReportById(id: string): Promise<InspectionReport | null> {
  if (IS_DEMO) {
    const { demoGetReport } = await import('@/lib/demo')
    return demoGetReport(id)
  }
  const supabase = await createClient()
  const { data } = await supabase.from('inspection_reports').select('*').eq('id', id).maybeSingle()
  if (!data) return null
  // Bucket is private (migration 013): re-sign every photo url from its path.
  return signReportPhotos(supabase, data as InspectionReport)
}

/**
 * Fetch a report and its inspector's name in a SINGLE round-trip (PostgREST
 * embed over the inspector_id FK). Used by the report document so it doesn't
 * need a second query for the inspector name.
 */
export async function getReportWithInspector(
  id: string,
): Promise<{ report: InspectionReport; inspectorName: string | null } | null> {
  if (IS_DEMO) {
    const { demoGetReport, DEMO_PROFILE } = await import('@/lib/demo')
    const report = demoGetReport(id)
    return report ? { report, inspectorName: DEMO_PROFILE.full_name } : null
  }
  const supabase = await createClient()
  const { data } = await supabase
    .from('inspection_reports')
    .select('*, inspector:inspector_profiles(full_name)')
    .eq('id', id)
    .maybeSingle()
  if (!data) return null
  const { inspector, ...report } = data as InspectionReport & {
    inspector: { full_name: string } | null
  }
  // Bucket is private (migration 013): re-sign every photo url from its path.
  const signed = await signReportPhotos(supabase, report as InspectionReport)
  return { report: signed, inspectorName: inspector?.full_name ?? null }
}

/**
 * Same as getReportWithInspector but via the service-role client (bypasses RLS).
 * ONLY for the token-authorised PDF render, where there is no user session.
 */
export async function getReportWithInspectorAdmin(
  id: string,
): Promise<{ report: InspectionReport; inspectorName: string | null } | null> {
  if (IS_DEMO) {
    const { demoGetReport, DEMO_PROFILE } = await import('@/lib/demo')
    const report = demoGetReport(id)
    return report ? { report, inspectorName: DEMO_PROFILE.full_name } : null
  }
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('inspection_reports')
    .select('*, inspector:inspector_profiles(full_name)')
    .eq('id', id)
    .maybeSingle()
  if (!data) return null
  const { inspector, ...report } = data as InspectionReport & {
    inspector: { full_name: string } | null
  }
  // Bucket is private (migration 013): re-sign every photo url from its path. The
  // service-role client bypasses RLS, so it can sign any report's photos — this
  // is what lets the cookie-less headless-Chrome PDF render load the images.
  const signed = await signReportPhotos(supabase, report as InspectionReport)
  return { report: signed, inspectorName: inspector?.full_name ?? null }
}

/** Resolve the display name of the inspector who owns a report (for the report). */
export async function getInspectorName(inspectorId: string | null): Promise<string | null> {
  if (!inspectorId) return null
  if (IS_DEMO) {
    const { DEMO_PROFILE } = await import('@/lib/demo')
    return DEMO_PROFILE.full_name
  }
  const supabase = await createClient()
  const { data } = await supabase
    .from('inspector_profiles')
    .select('full_name')
    .eq('id', inspectorId)
    .maybeSingle()
  return (data?.full_name as string) ?? null
}
