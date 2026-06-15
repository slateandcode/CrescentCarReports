/**
 * Demo / preview mode.
 *
 * Demo mode skips auth and serves sample reports from memory so the UI is fully
 * browsable without a backend. It FAILS CLOSED: it requires an EXPLICIT opt-in
 * (NEXT_PUBLIC_ENABLE_GUEST_MODE=true) AND a non-production build. Previously it
 * turned on whenever NEXT_PUBLIC_SUPABASE_URL was unset, which meant a cleared or
 * mistyped env var would silently boot PRODUCTION into unauthenticated demo mode
 * — the auth gate in middleware is bypassed when IS_DEMO is true.
 *
 * NEXT_PUBLIC_ vars are inlined at build time, so this resolves correctly on
 * both the server and the client.
 */
export const IS_DEMO =
  process.env.NEXT_PUBLIC_ENABLE_GUEST_MODE === 'true' &&
  process.env.NODE_ENV !== 'production'

// Fail LOUDLY, not silently, if a production build is missing its Supabase URL
// and isn't a (now non-production-only) demo build. Throwing at module load
// turns a misconfiguration into an obvious build/boot failure instead of an
// unauthenticated app. A normal build with NEXT_PUBLIC_SUPABASE_URL set never
// hits this; local preview opts into demo mode (handled above) so is exempt.
if (
  process.env.NODE_ENV === 'production' &&
  !IS_DEMO &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL
) {
  throw new Error(
    'NEXT_PUBLIC_SUPABASE_URL is not set in a production build. Configure Supabase, ' +
      'or explicitly enable demo mode (NEXT_PUBLIC_ENABLE_GUEST_MODE=true in a non-production build).',
  )
}
