import 'server-only'
import { createServiceClient } from '@/lib/supabase/server'
import { IS_DEMO } from '@/lib/env'

/**
 * Per-user cap on the two Groq-backed AI features, via the fixed-window
 * `check_rate_limit` RPC from migration 014 (service-role only, atomic across
 * Netlify's stateless instances — the same primitive the public website uses).
 *
 * The routes were session-gated but uncapped: any single signed-in account (or
 * a cross-site page riding an inspector's cookie) could loop them and drain the
 * Groq quota for everyone. 30 calls per feature per 10 minutes is far beyond
 * real inspector use — it only ever stops loops.
 *
 * Fails OPEN: a rate-limiter outage must degrade to "no cap", never take the
 * feature down with it.
 */
const MAX_CALLS = 30
const WINDOW_SECONDS = 600

export async function allowAiCall(userId: string, feature: 'polish' | 'summary'): Promise<boolean> {
  if (IS_DEMO) return true
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_key: `ai:${feature}:${userId}`,
      p_max: MAX_CALLS,
      p_window_seconds: WINDOW_SECONDS,
    })
    if (error) {
      console.error('[allowAiCall] rate-limit check failed', error.message)
      return true
    }
    return data !== false
  } catch (e) {
    console.error('[allowAiCall] rate-limit check threw', e)
    return true
  }
}
