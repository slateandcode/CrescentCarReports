'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { IS_DEMO } from '@/lib/env'
import { getSessionUser } from '@/lib/auth'
import { generatePublicId } from '@/lib/utils'
import { computeCounts, mergeFindings } from '@/lib/report-utils'
import { validateForCompletion } from '@/lib/report-validation'
import type {
  ChecklistData,
  CriticalFinding,
  InspectionReport,
  PackageType,
  PhotoRef,
} from '@/lib/report-types'

const VALID_PACKAGES: PackageType[] = ['standard', 'comprehensive', 'premium']

/** Create a fresh draft report for the chosen package and open its editor. */
export async function createReport(packageType: PackageType): Promise<void> {
  if (!VALID_PACKAGES.includes(packageType)) throw new Error('Invalid package.')

  if (IS_DEMO) {
    const { demoCreateReport } = await import('@/lib/demo')
    const r = demoCreateReport(packageType)
    revalidatePath('/reports')
    revalidatePath('/dashboard')
    redirect(`/reports/${r.id}/edit`)
  }

  const session = await getSessionUser()
  if (!session) redirect('/login')

  const supabase = await createClient()

  // Issue a sequential reference (CCR-YYYY-0001) via the DB function.
  const { data: reference, error: refErr } = await supabase.rpc('next_report_reference')
  if (refErr || !reference) throw new Error('Could not allocate a report reference.')

  const { data, error } = await supabase
    .from('inspection_reports')
    .insert({
      report_reference: reference,
      public_id: generatePublicId(),
      inspector_id: session.id,
      status: 'draft',
      package_type: packageType,
      vehicle_make: '',
      vehicle_model: '',
      checklist: {},
      critical_findings: [],
      photos: [],
      counts: computeCounts(packageType, {}),
    })
    .select('id')
    .single()

  if (error || !data) throw new Error(error?.message || 'Could not create report.')

  revalidatePath('/reports')
  revalidatePath('/dashboard')
  redirect(`/reports/${data.id}/edit`)
}

/** Fields the editor may patch. Everything optional — autosave sends deltas. */
export interface ReportPatch {
  customer_name?: string | null
  customer_phone?: string | null
  customer_email?: string | null
  vehicle_make?: string
  vehicle_model?: string
  vehicle_year?: string | null
  vin?: string | null
  plate_number?: string | null
  odometer?: string | null
  regional_specs?: string | null
  transmission?: string | null
  fuel_type?: string | null
  engine_size?: string | null
  exterior_colour?: string | null
  inspection_location?: string | null
  inspection_date?: string | null
  inspection_time?: string | null
  main_vehicle_image_url?: string | null
  overall_condition?: string | null
  buyer_recommendation?: string | null
  inspector_summary?: string | null
  price_negotiation_notes?: string | null
  summary_call_notes?: string | null
  checklist?: ChecklistData
  critical_findings?: CriticalFinding[]
  photos?: PhotoRef[]
}

export interface SaveResult {
  ok: boolean
  error?: string
  updated_at?: string
  counts?: ReturnType<typeof computeCounts>
  critical_findings?: CriticalFinding[]
}

/**
 * Persist an editor patch. Counts and auto critical-findings are always
 * recomputed server-side from the package + checklist so they can't drift.
 */
export async function saveReport(id: string, patch: ReportPatch): Promise<SaveResult> {
  if (IS_DEMO) {
    const { demoSaveReport } = await import('@/lib/demo')
    const next = demoSaveReport(id, patch as Partial<InspectionReport>)
    if (!next) return { ok: false, error: 'Report not found.' }
    return {
      ok: true,
      updated_at: next.updated_at,
      counts: next.counts as ReturnType<typeof computeCounts>,
      critical_findings: next.critical_findings,
    }
  }

  // Server actions are public endpoints: re-verify the session on every mutation
  // rather than trusting RLS or the throttled middleware suspension check.
  const session = await getSessionUser()
  if (!session) return { ok: false, error: 'Your session has expired. Please sign in again.' }

  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('inspection_reports')
    .select('package_type, checklist, critical_findings, status')
    .eq('id', id)
    .maybeSingle()

  if (!existing) return { ok: false, error: 'Report not found or access denied.' }

  const pkg = existing.package_type as PackageType
  const checklist = (patch.checklist ?? existing.checklist ?? {}) as ChecklistData
  const counts = computeCounts(pkg, checklist)
  const storedFindings = (patch.critical_findings ??
    existing.critical_findings ??
    []) as CriticalFinding[]
  const critical_findings = mergeFindings(pkg, checklist, storedFindings)

  const update: Record<string, unknown> = { ...patch, counts, critical_findings }

  const { data, error } = await supabase
    .from('inspection_reports')
    .update(update)
    .eq('id', id)
    .select('updated_at')
    .maybeSingle()

  if (error || !data) return { ok: false, error: error?.message || 'Save failed.' }

  return { ok: true, updated_at: data.updated_at, counts, critical_findings }
}

/** Validate + mark a report completed. */
export async function completeReport(id: string): Promise<SaveResult> {
  if (IS_DEMO) {
    const { demoGetReport, demoSetStatus } = await import('@/lib/demo')
    const report = demoGetReport(id)
    if (!report) return { ok: false, error: 'Report not found.' }
    const result = validateForCompletion(report)
    if (!result.ok) return { ok: false, error: result.errors.join(' ') }
    demoSetStatus(id, 'completed')
    revalidatePath('/reports')
    revalidatePath('/dashboard')
    return { ok: true }
  }

  const session = await getSessionUser()
  if (!session) return { ok: false, error: 'Your session has expired. Please sign in again.' }

  const supabase = await createClient()
  const { data: report } = await supabase
    .from('inspection_reports')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!report) return { ok: false, error: 'Report not found or access denied.' }

  const result = validateForCompletion(report as InspectionReport)
  if (!result.ok) return { ok: false, error: result.errors.join(' ') }

  const { error } = await supabase
    .from('inspection_reports')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/reports')
  revalidatePath('/dashboard')
  revalidatePath(`/reports/${id}/preview`)
  return { ok: true }
}

/** Move a completed report back to draft for further edits. */
export async function reopenReport(id: string): Promise<SaveResult> {
  if (IS_DEMO) {
    const { demoSetStatus } = await import('@/lib/demo')
    demoSetStatus(id, 'draft')
    revalidatePath(`/reports/${id}/edit`)
    return { ok: true }
  }
  const session = await getSessionUser()
  if (!session) return { ok: false, error: 'Your session has expired. Please sign in again.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('inspection_reports')
    .update({ status: 'draft', completed_at: null })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/reports/${id}/edit`)
  return { ok: true }
}

export async function setReportStatus(
  id: string,
  status: 'draft' | 'archived',
): Promise<SaveResult> {
  if (IS_DEMO) {
    const { demoSetStatus } = await import('@/lib/demo')
    demoSetStatus(id, status)
    revalidatePath('/reports')
    return { ok: true }
  }
  const session = await getSessionUser()
  if (!session) return { ok: false, error: 'Your session has expired. Please sign in again.' }

  const supabase = await createClient()
  const { error } = await supabase.from('inspection_reports').update({ status }).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/reports')
  return { ok: true }
}

/**
 * Delete a report. The remaining references are re-sequenced so the numbering
 * stays gapless (CCR-YYYY-0001, 0002 …) — handled in-memory in demo mode, and
 * by the `delete_report_renumber` RPC against Supabase. Returns a result so the
 * caller can decide where to navigate (list stays put; editor returns to list).
 */
export async function deleteReport(id: string): Promise<{ ok: boolean; error?: string }> {
  if (IS_DEMO) {
    const { demoDeleteReport } = await import('@/lib/demo')
    const existed = demoDeleteReport(id)
    revalidatePath('/reports')
    revalidatePath('/dashboard')
    return existed ? { ok: true } : { ok: false, error: 'Report not found.' }
  }

  // Admin-only: migration 008 tightened the table DELETE policy to admins, but the
  // delete_report_renumber RPC is SECURITY DEFINER and still authorises by
  // own-or-admin, so a non-admin inspector could otherwise delete their own report
  // (and re-sequence everyone's references). Enforce admin here, the only caller.
  const session = await getSessionUser()
  if (!session) return { ok: false, error: 'Your session has expired. Please sign in again.' }
  if (session.profile.role !== 'admin') {
    return { ok: false, error: 'Only admins can delete reports.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('delete_report_renumber', { p_report_id: id })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/reports')
  revalidatePath('/dashboard')
  return { ok: true }
}
