import { ShieldCheck, User } from 'lucide-react'
import type { Role } from '@/lib/report-types'

/** Role pill (admin = gold, inspector = neutral). */
export function RoleBadge({ role }: { role: Role }) {
  return role === 'admin' ? (
    <span className="inline-flex items-center gap-1 rounded-tag border border-accent/30 bg-accent-muted px-2 py-0.5 text-xs font-semibold text-accent">
      <ShieldCheck size={12} /> Admin
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-tag border border-border bg-surface px-2 py-0.5 text-xs font-semibold text-text-secondary">
      <User size={12} /> Inspector
    </span>
  )
}

/** Active / suspended pill. */
export function MemberStatusBadge({ status }: { status: 'active' | 'suspended' }) {
  return status === 'active' ? (
    <span className="rounded-tag border border-pass/30 bg-pass-muted px-2 py-0.5 text-xs font-semibold text-pass">
      Active
    </span>
  ) : (
    <span className="rounded-tag border border-fail/30 bg-fail-muted px-2 py-0.5 text-xs font-semibold text-fail">
      Suspended
    </span>
  )
}
