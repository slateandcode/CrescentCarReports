import { createClient } from '@/lib/supabase/server'
import { IS_DEMO } from '@/lib/env'
import type { InspectorProfile } from './report-types'

/**
 * Team / member queries (admin surface). RLS lets admins read every
 * inspector_profiles row; inspectors only ever see their own, so these are
 * called from admin-gated pages only.
 */

/** All team members, admins first then alphabetical. */
export async function getTeamMembers(): Promise<InspectorProfile[]> {
  if (IS_DEMO) {
    const { DEMO_SESSION } = await import('@/lib/demo')
    return [DEMO_SESSION.profile]
  }
  const supabase = await createClient()
  const { data } = await supabase
    .from('inspector_profiles')
    .select('*')
    // 'admin' < 'inspector' alphabetically, so ascending lists admins first.
    .order('role', { ascending: true })
    .order('full_name', { ascending: true })
  return (data as InspectorProfile[]) || []
}

/** One member's profile (admin view). */
export async function getMemberById(id: string): Promise<InspectorProfile | null> {
  if (IS_DEMO) {
    const { DEMO_SESSION } = await import('@/lib/demo')
    return DEMO_SESSION.profile.id === id ? DEMO_SESSION.profile : null
  }
  const supabase = await createClient()
  const { data } = await supabase.from('inspector_profiles').select('*').eq('id', id).maybeSingle()
  return (data as InspectorProfile) || null
}

/** How many inspection reports a member owns. */
export async function getMemberReportCount(id: string): Promise<number> {
  if (IS_DEMO) return 0
  const supabase = await createClient()
  const { count } = await supabase
    .from('inspection_reports')
    .select('id', { count: 'exact', head: true })
    .eq('inspector_id', id)
  return count || 0
}
