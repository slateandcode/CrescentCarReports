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
  checklist?: ChecklistData
  critical_findings?: CriticalFinding[]
  photos?: PhotoRef[]
}

export interface SaveResult {
  ok: boolean
  error?: string
  /** True when an optimistic-concurrency precondition matched 0 rows: the report
   *  was changed elsewhere since `expectedUpdatedAt`. The caller should stop
   *  autosaving and prompt for a reload rather than treating it as a transient
   *  error. */
  conflict?: boolean
  updated_at?: string
  counts?: ReturnType<typeof computeCounts>
  critical_findings?: CriticalFinding[]
}

/**
 * Persist an editor patch. Counts and auto critical-findings are always
 * recomputed server-side from the package + checklist so they can't drift.
 *
 * Optimistic concurrency: when `expectedUpdatedAt` is supplied (the row's
 * `updated_at` the editor last saw), the UPDATE is gated on it. If another
 * tab/user has since saved, `updated_at` no longer matches, the UPDATE touches
 * 0 rows, and we return `{ ok: false, conflict: true }` instead of silently
 * clobbering their whole report.
 */
export async function saveReport(
  id: string,
  patch: ReportPatch,
  expectedUpdatedAt?: string,
): Promise<SaveResult> {
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

  // Mass-assignment guard: a server action is a public POST and the ReportPatch
  // type is erased at runtime, so NEVER spread the raw patch into the UPDATE.
  // Copy only an explicit allowlist of inspector-editable columns. This keeps a
  // crafted call from forcing status='completed' (bypassing validateForCompletion),
  // overwriting the unguessable public_id / the UNIQUE report_reference, or
  // reassigning inspector_id. Status transitions go only through
  // completeReport/reopenReport/setReportStatus; counts + critical_findings are
  // recomputed below and never trusted from the client.
  const MUTABLE_COLUMNS: (keyof ReportPatch)[] = [
    'customer_name',
    'customer_phone',
    'customer_email',
    'vehicle_make',
    'vehicle_model',
    'vehicle_year',
    'vin',
    'plate_number',
    'odometer',
    'regional_specs',
    'transmission',
    'fuel_type',
    'engine_size',
    'exterior_colour',
    'inspection_location',
    'inspection_date',
    'inspection_time',
    'main_vehicle_image_url',
    'overall_condition',
    'buyer_recommendation',
    'inspector_summary',
    'price_negotiation_notes',
    'checklist',
    'photos',
  ]
  const update: Record<string, unknown> = {}
  for (const key of MUTABLE_COLUMNS) {
    if (key in patch) update[key] = patch[key]
  }
  update.counts = counts
  update.critical_findings = critical_findings

  let query = supabase.from('inspection_reports').update(update).eq('id', id)
  // Optimistic-concurrency gate: only update if the row still has the
  // updated_at the editor last observed. A stale value matches 0 rows → conflict.
  if (expectedUpdatedAt) query = query.eq('updated_at', expectedUpdatedAt)

  const { data, error } = await query.select('updated_at').maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!data) {
    // No row matched. With a precondition this means a concurrent write moved
    // updated_at on (the row still exists / is accessible). Surface it as a
    // conflict so the editor can stop autosaving and ask for a reload.
    if (expectedUpdatedAt) {
      return {
        ok: false,
        conflict: true,
        error: 'This report was changed elsewhere. Reload to get the latest version.',
      }
    }
    return { ok: false, error: 'Save failed.' }
  }

  return { ok: true, updated_at: data.updated_at, counts, critical_findings }
}

/** Validate + mark a report completed. */
/**
 * Fire-and-forget: ask the background function to pre-render this report's PDF
 * into the cache so the next (often mobile) download is instant instead of waiting
 * on a cold-start Chromium render. Awaits only the 202 ack; the render runs in the
 * background function's own lifecycle. Never throws into the caller — the download
 * route still renders on demand if this didn't run (e.g. local dev, where there's
 * no Netlify functions runtime).
 */
async function triggerPdfPrerender(id: string): Promise<void> {
  const secret = process.env.PDF_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  const base = (process.env.NEXT_PUBLIC_APP_URL || process.env.URL || '').replace(/\/$/, '')
  if (!secret || !base) return
  try {
    await fetch(`${base}/.netlify/functions/render-report-pdf-background`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId: id, auth: secret }),
    })
  } catch {
    // Best-effort pre-warm; the download route renders on demand if it didn't run.
  }
}

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

  // Pre-render the PDF into the cache so the download is instant for the inspector
  // and the customer (the report is final at completion).
  await triggerPdfPrerender(id)
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
  // TS types are erased at runtime and this is an exported server action, so
  // enforce the allowlist — never let a crafted call slip 'completed' through
  // here (which would bypass validateForCompletion + the completed_at stamp).
  if (status !== 'draft' && status !== 'archived') {
    return { ok: false, error: 'Invalid status.' }
  }
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
