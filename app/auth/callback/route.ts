import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { safeInternalPath } from '@/lib/utils'

/**
 * OAuth/recovery code exchange. Supabase email links land here with `?code=`;
 * we exchange it for a session cookie and redirect onward (e.g. /auth/reset for
 * a password recovery).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  // Same open-redirect guard as /login (rejects //host and /\host).
  const safeNext = safeInternalPath(searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${safeNext}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?reason=link_expired`)
}
