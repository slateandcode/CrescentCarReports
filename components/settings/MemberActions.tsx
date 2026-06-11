'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserX, UserCheck, Loader2 } from 'lucide-react'
import { setMemberStatus } from '@/app/(app)/settings/actions'

/** Kick (suspend) / reactivate controls on a member's profile. Admin-only page. */
export function MemberActions({
  memberId,
  status,
  isSelf,
}: {
  memberId: string
  status: 'active' | 'suspended'
  isSelf: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  if (isSelf) {
    return (
      <p className="text-sm text-text-muted">
        This is your own account — you can&apos;t change your own access.
      </p>
    )
  }

  function run(next: 'active' | 'suspended') {
    setError(null)
    startTransition(async () => {
      const res = await setMemberStatus(memberId, next)
      if (!res.ok) {
        setError(res.error || 'Could not update this member.')
        return
      }
      setConfirming(false)
      router.refresh()
    })
  }

  if (status === 'suspended') {
    return (
      <div>
        <button onClick={() => run('active')} disabled={pending} className="btn-secondary">
          {pending ? <Loader2 size={16} className="animate-spin" /> : <UserCheck size={16} />}
          Reactivate member
        </button>
        {error && <p className="mt-2 text-sm text-fail">{error}</p>}
      </div>
    )
  }

  return (
    <div>
      {confirming ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <span className="text-sm text-text-secondary">Remove this member&apos;s access?</span>
          <div className="flex gap-2">
            <button onClick={() => run('suspended')} disabled={pending} className="btn-danger">
              {pending ? <Loader2 size={16} className="animate-spin" /> : <UserX size={16} />}
              Yes, kick
            </button>
            <button onClick={() => setConfirming(false)} disabled={pending} className="btn-secondary">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setConfirming(true)} className="btn-danger">
          <UserX size={16} /> Kick member
        </button>
      )}
      {error && <p className="mt-2 text-sm text-fail">{error}</p>}
    </div>
  )
}
