import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Next 16 renamed the `middleware` convention to `proxy`. This runs on the
// server before routes render — here it guards auth + session.
export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  // Run on everything except Next internals, the icon, static assets, and Netlify
  // platform paths. `.netlify/functions/*` (e.g. the background PDF renderer) must
  // bypass the auth redirect — those functions do their own secret-based auth.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.png|\\.netlify|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)',
  ],
}
