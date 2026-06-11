'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { IS_DEMO } from '@/lib/env'
import { cn } from '@/lib/utils'
import { Spinner } from '@/components/ui/Spinner'

export function LogoutButton({ className, label = 'Log out' }: { className?: string; label?: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  // In preview mode there is no session to end — hide the control.
  if (IS_DEMO) return null

  async function logout() {
    setLoading(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  return (
    <button
      onClick={logout}
      disabled={loading}
      aria-label={label || 'Log out'}
      className={cn(
        'inline-flex min-h-[40px] items-center gap-2 rounded-input border border-border bg-card px-3 text-sm font-medium text-text-secondary transition-colors hover:border-border-hover hover:text-text-primary',
        className,
      )}
    >
      {loading ? <Spinner className="h-4 w-4" /> : <LogOut size={16} />}
      {label && <span>{label}</span>}
    </button>
  )
}
