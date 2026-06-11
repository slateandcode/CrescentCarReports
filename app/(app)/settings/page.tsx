import { format } from 'date-fns'
import { Mail, ShieldCheck } from 'lucide-react'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { isPast } from '@/lib/utils'
import { IS_DEMO } from '@/lib/env'
import { LogoutButton } from '@/components/auth/LogoutButton'
import { ProfileForm } from '@/components/settings/ProfileForm'
import { InviteForm } from '@/components/settings/InviteForm'
import { TeamMembers } from '@/components/settings/TeamMembers'

export const metadata = { title: 'Settings' }
export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const { profile } = await requireUser()
  const isAdmin = profile.role === 'admin'

  // Admins see outstanding invites.
  let invites: { id: string; email: string; role: string; expires_at: string; used_at: string | null }[] = []
  if (isAdmin && !IS_DEMO) {
    const supabase = await createClient()
    const { data } = await supabase
      .from('inspector_invites')
      .select('id, email, role, expires_at, used_at')
      .order('created_at', { ascending: false })
      .limit(20)
    invites = data || []
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-display-sm text-text-primary">Settings</h1>

      {IS_DEMO && (
        <div className="rounded-card border border-accent/30 bg-accent-muted p-3 text-sm text-accent">
          Preview mode — Supabase isn’t connected, so changes here aren’t saved and invites are
          disabled. Add your Supabase keys to <span className="font-mono">.env.local</span> to go live.
        </div>
      )}

      <section className="card-base p-5">
        <h2 className="mb-4 text-lg font-semibold text-text-primary">Your profile</h2>
        <ProfileForm profile={profile} />
        <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
          <span className="inline-flex items-center gap-1.5 text-sm capitalize text-text-secondary">
            <ShieldCheck size={15} className="text-accent" /> {profile.role}
          </span>
          <LogoutButton />
        </div>
      </section>

      {isAdmin && (
        <section className="card-base p-5">
          <h2 className="text-lg font-semibold text-text-primary">Invite a team member</h2>
          <p className="mb-4 mt-0.5 text-sm text-text-secondary">
            Crescent Car Reports is invite-only. Generate a secure link for a new inspector or admin.
          </p>
          <InviteForm />

          {invites.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-2 text-sm font-semibold text-text-secondary">Recent invites</h3>
              <ul className="divide-y divide-border">
                {invites.map((inv) => {
                  const expired = isPast(inv.expires_at)
                  const state = inv.used_at ? 'Used' : expired ? 'Expired' : 'Pending'
                  return (
                    <li key={inv.id} className="flex items-center gap-3 py-2.5 text-sm">
                      <Mail size={15} className="text-text-muted" />
                      <span className="min-w-0 flex-1 truncate text-text-primary">{inv.email}</span>
                      <span className="hidden capitalize text-text-muted sm:inline">{inv.role}</span>
                      <span
                        className={
                          state === 'Used'
                            ? 'text-pass'
                            : state === 'Expired'
                              ? 'text-text-muted'
                              : 'text-attention'
                        }
                      >
                        {state}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </section>
      )}

      {isAdmin && <TeamMembers currentUserId={profile.id} />}

      <p className="text-center text-xs text-text-muted">
        Member since {format(new Date(profile.created_at), 'MMMM yyyy')} · Crescent Car Reports by Crescent Car Check
      </p>
    </div>
  )
}
