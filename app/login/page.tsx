import { AuthShell } from '@/components/auth/AuthShell'
import { LoginForm } from '@/components/auth/LoginForm'
import { safeInternalPath } from '@/lib/utils'

export const metadata = { title: 'Sign in' }

const NOTICES: Record<string, string> = {
  inactive: 'You were signed out after 14 days of inactivity. Please sign in again.',
  suspended: 'Your account is currently suspended. Contact an administrator.',
  reset: 'Your password has been updated. Sign in with your new password.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; reason?: string }>
}) {
  const { redirect, reason } = await searchParams
  // Reject protocol-relative / backslash values so ?redirect= can't open-redirect
  // a freshly-authenticated inspector off-site (see safeInternalPath).
  const redirectTo = safeInternalPath(redirect)
  const notice = reason ? NOTICES[reason] : undefined

  return (
    <AuthShell title="Sign in" subtitle="Inspector access only">
      <LoginForm redirectTo={redirectTo} notice={notice} />
    </AuthShell>
  )
}
