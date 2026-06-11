import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { IS_DEMO } from '@/lib/env'
import type { InspectorProfile } from './report-types'

export interface SessionUser {
  id: string
  email: string
  profile: InspectorProfile
}

/**
 * Resolve the signed-in user + their inspector profile for Server Components.
 * Returns null when signed out or when no profile row exists yet.
 *
 * Wrapped in React `cache()` so the layout, the page, and any nested server
 * component share a SINGLE auth + profile lookup per request instead of each
 * re-querying Supabase — this removes ~2 round-trips on every page load.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  if (IS_DEMO) {
    const { DEMO_SESSION } = await import('@/lib/demo')
    return DEMO_SESSION
  }
  const supabase = await createClient()
  // Verify the JWT locally (asymmetric ES256 signing keys + a process-cached
  // JWKS) rather than a network round-trip to the Auth server. getClaims() still
  // refreshes the session via getSession() under the hood, so the cookie stays
  // fresh — we just stop paying a UAE→Mumbai hop to confirm who the user is.
  const { data, error } = await supabase.auth.getClaims()
  const claims = data?.claims as { sub?: string; email?: string } | undefined
  if (error || !claims?.sub) return null
  const userId = claims.sub

  const { data: profile } = await supabase
    .from('inspector_profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (!profile) return null
  // A suspended ("kicked") member loses all access — treat them as signed out so
  // every protected page redirects them to /login.
  if ((profile as InspectorProfile).status === 'suspended') return null
  return { id: userId, email: claims.email ?? profile.email, profile: profile as InspectorProfile }
})

/** Require a session or redirect to /login. Use at the top of protected pages. */
export async function requireUser(): Promise<SessionUser> {
  const session = await getSessionUser()
  if (!session) redirect('/login')
  return session
}

/** Require an admin session or redirect to the dashboard. */
export async function requireAdmin(): Promise<SessionUser> {
  const session = await requireUser()
  if (session.profile.role !== 'admin') redirect('/dashboard')
  return session
}
