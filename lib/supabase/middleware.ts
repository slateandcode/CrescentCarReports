import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { IS_DEMO } from '@/lib/env'

/** Routes that never require a session. */
const PUBLIC_PREFIXES = ['/login', '/invite', '/forgot-password', '/auth']

/** Inactivity window — a session idle longer than this is force-logged-out. */
const INACTIVITY_LIMIT_MS = 14 * 24 * 60 * 60 * 1000 // 14 days
/** Auth-cookie lifetime, re-stamped on every authenticated request → a sliding
 *  14-day "remember me" window that matches INACTIVITY_LIMIT_MS. */
const AUTH_COOKIE_MAX_AGE_S = 14 * 24 * 60 * 60 // 14 days, in seconds

/** Cookie that timestamps the last status/activity DB check. */
const HEARTBEAT_COOKIE = 'ccr_session_hb'
/** Only re-read the profile for the inactivity/suspension check this often. */
const HEARTBEAT_INTERVAL_MS = 10 * 60 * 1000 // 10 minutes

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

/**
 * Build a redirect that CARRIES the cookies Supabase wrote onto `response`
 * (a refreshed/rotated session, or sign-out's cleared cookies). A bare
 * NextResponse.redirect drops them — the documented @supabase/ssr middleware
 * pitfall — which can silently log the user out on the next request.
 */
function redirectWithCookies(url: URL, response: NextResponse): NextResponse {
  const redirectRes = NextResponse.redirect(url)
  for (const cookie of response.cookies.getAll()) {
    redirectRes.cookies.set(cookie.name, cookie.value, cookie)
  }
  return redirectRes
}

/**
 * "Remember me": re-emit the Supabase auth cookies as SERVER-set (HTTP
 * Set-Cookie) with a fresh 14-day max-age on every authenticated request.
 *
 * The Supabase BROWSER client writes these cookies via document.cookie (on
 * sign-in and client-side token refresh). Safari's ITP caps script-written
 * cookies to 7 days regardless of their max-age, which silently logged users
 * out ~a week after signing in. Cookies written server-side are exempt from that
 * cap, so re-stamping them here keeps the session alive — and because it runs on
 * every request, the 14-day window slides with activity.
 *
 * Skips any cookie Supabase already refreshed onto this response (so a freshly
 * rotated token isn't clobbered with the stale request value). httpOnly stays
 * false to match the @supabase/ssr default so the browser client can still read
 * them.
 */
function rememberAuthCookies(request: NextRequest, response: NextResponse) {
  const alreadySet = new Set(response.cookies.getAll().map((c) => c.name))
  for (const cookie of request.cookies.getAll()) {
    if (
      cookie.name.startsWith('sb-') &&
      cookie.name.includes('-auth-token') &&
      !alreadySet.has(cookie.name)
    ) {
      response.cookies.set(cookie.name, cookie.value, {
        httpOnly: false,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: AUTH_COOKIE_MAX_AGE_S,
      })
    }
  }
}

/**
 * Runs on every app request. It:
 *   1. refreshes the Supabase session cookie,
 *   2. protects all non-public routes (redirect to /login when signed out),
 *   3. enforces the 14-day inactivity rule using last_activity_at,
 *   4. lazily bumps last_activity_at (at most once/hour) for active users.
 */
export async function updateSession(request: NextRequest) {
  // Demo / preview mode: no Supabase, no auth — let every route render.
  if (IS_DEMO) {
    const { pathname } = request.nextUrl
    if (pathname === '/' || pathname === '/login') {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      url.search = ''
      return NextResponse.redirect(url)
    }
    return NextResponse.next({ request })
  }

  // Server-side PDF render surface: headless Chrome loads /render/:id?pdf=TOKEN
  // with no cookie. The route 404s unless the signed token is valid, so skip all
  // session work here (and don't redirect to login).
  if (request.nextUrl.pathname.startsWith('/render/')) {
    return NextResponse.next({ request })
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // Verify the JWT locally (asymmetric ES256 signing keys + a process-cached
  // JWKS) instead of a network round-trip to the Auth server on every request.
  // getClaims() still refreshes the session via getSession() under the hood, so
  // the cookie stays fresh exactly like getUser() did.
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = (claimsData?.claims as { sub?: string } | undefined)?.sub

  const { pathname } = request.nextUrl
  const onPublic = isPublicPath(pathname)
  // Next.js prefetches links in the background; for those we only need the auth
  // gate, not the inactivity/activity DB work — skip it to avoid an extra
  // Supabase round-trip per prefetched link.
  const isPrefetch =
    request.headers.get('next-router-prefetch') === '1' ||
    request.headers.get('purpose') === 'prefetch' ||
    request.headers.get('x-purpose') === 'prefetch'

  // Signed out + private route → bounce to login (preserve intended path).
  if (!userId && !onPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', pathname)
    return redirectWithCookies(url, response)
  }

  if (userId && !isPrefetch) {
    const now = Date.now()
    // Throttle the inactivity/suspension profile read: at most once per
    // HEARTBEAT_INTERVAL_MS per session, not on every navigation. A suspension
    // therefore takes effect within that window (fine for this app); the 14-day
    // inactivity rule is unaffected by the coarser granularity.
    const hbLast = Number.parseInt(request.cookies.get(HEARTBEAT_COOKIE)?.value ?? '', 10)
    const dueForCheck = !Number.isFinite(hbLast) || now - hbLast > HEARTBEAT_INTERVAL_MS

    if (dueForCheck) {
      // Enforce inactivity + keep last_activity_at fresh.
      const { data: profile } = await supabase
        .from('inspector_profiles')
        .select('last_activity_at, status')
        .eq('id', userId)
        .maybeSingle()

      const last = profile?.last_activity_at ? new Date(profile.last_activity_at).getTime() : null
      const inactive = last !== null && now - last > INACTIVITY_LIMIT_MS
      const suspended = profile?.status === 'suspended'

      if ((inactive || suspended) && !onPublic) {
        await supabase.auth.signOut()
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        url.searchParams.set('reason', suspended ? 'suspended' : 'inactive')
        return redirectWithCookies(url, response)
      }

      // Bump activity at most once per hour to avoid a write on every check.
      if (!last || now - last > 60 * 60 * 1000) {
        await supabase
          .from('inspector_profiles')
          .update({ last_activity_at: new Date(now).toISOString() })
          .eq('id', userId)
      }

      // Stamp the heartbeat so checks within the window skip the DB entirely.
      response.cookies.set(HEARTBEAT_COOKIE, String(now), {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 30 * 24 * 60 * 60,
      })
    }

    // Already authenticated but sitting on an auth page → send to dashboard.
    if (pathname === '/login' || pathname === '/') {
      rememberAuthCookies(request, response)
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      url.search = ''
      return redirectWithCookies(url, response)
    }
  }

  // Keep the signed-in session alive past Safari's 7-day script-cookie cap.
  if (userId) rememberAuthCookies(request, response)
  return response
}
