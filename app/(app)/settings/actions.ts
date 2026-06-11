'use server'

import { revalidatePath } from 'next/cache'
import { getSessionUser } from '@/lib/auth'
import { IS_DEMO } from '@/lib/env'
import { createClient, createServiceClient, isServiceConfigured } from '@/lib/supabase/server'
import { generateInviteToken } from '@/lib/utils'
import { isValidEmail } from '@/lib/report-validation'
import type { Role } from '@/lib/report-types'

export interface InviteResult {
  ok: boolean
  error?: string
  url?: string
  email?: string
}

/** Admin-only: mint an invite link for a new inspector or admin. */
export async function createInvite(formData: FormData): Promise<InviteResult> {
  if (IS_DEMO) return { ok: false, error: 'Preview mode — connect Supabase to create invites.' }
  const session = await getSessionUser()
  if (!session || session.profile.role !== 'admin') {
    return { ok: false, error: 'Only admins can create invites.' }
  }
  if (!isServiceConfigured()) {
    return { ok: false, error: 'Server is not configured for invites.' }
  }

  const email = String(formData.get('email') || '').trim().toLowerCase()
  const role = (String(formData.get('role') || 'inspector') as Role)
  if (!isValidEmail(email)) return { ok: false, error: 'Enter a valid email address.' }
  if (role !== 'inspector' && role !== 'admin') return { ok: false, error: 'Invalid role.' }

  const service = createServiceClient()

  // Block duplicate active accounts.
  const { data: existing } = await service
    .from('inspector_profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle()
  if (existing) return { ok: false, error: 'An account already exists for this email.' }

  const token = generateInviteToken()
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

  const { error } = await service.from('inspector_invites').insert({
    email,
    token,
    role,
    invited_by: session.id,
    expires_at: expires.toISOString(),
  })
  if (error) return { ok: false, error: error.message }

  const base = process.env.NEXT_PUBLIC_APP_URL || ''
  const url = `${base}/invite/${token}`

  revalidatePath('/settings')
  return { ok: true, url, email }
}

/**
 * Admin-only: suspend ("kick") or reactivate a team member. A suspended member
 * loses all access immediately — getSessionUser() blocks them and is_admin()
 * returns false — and is also banned in Supabase Auth so they can't sign back
 * in. Reversible. You can't change your own status (no self-lockout).
 */
export async function setMemberStatus(
  memberId: string,
  status: 'active' | 'suspended',
): Promise<{ ok: boolean; error?: string }> {
  if (IS_DEMO) return { ok: false, error: 'Preview mode — connect Supabase to manage members.' }
  const session = await getSessionUser()
  if (!session || session.profile.role !== 'admin') {
    return { ok: false, error: 'Only admins can manage team members.' }
  }
  if (memberId === session.id) {
    return { ok: false, error: "You can't change your own access." }
  }
  if (status !== 'active' && status !== 'suspended') {
    return { ok: false, error: 'Invalid status.' }
  }
  if (!isServiceConfigured()) {
    return { ok: false, error: 'Server is not configured to manage members.' }
  }

  const service = createServiceClient()
  const { error } = await service.from('inspector_profiles').update({ status }).eq('id', memberId)
  if (error) return { ok: false, error: error.message }

  // Best-effort: ban/unban the auth user so a kicked member can't sign back in.
  // The profile flag + getSessionUser block already revoke app access, so a
  // failure here is non-fatal.
  try {
    await service.auth.admin.updateUserById(memberId, {
      ban_duration: status === 'suspended' ? '876000h' : 'none',
    })
  } catch {
    /* non-fatal */
  }

  revalidatePath('/settings')
  revalidatePath(`/settings/members/${memberId}`)
  return { ok: true }
}

/** Update the signed-in user's own profile (name + phone). */
export async function updateMyProfile(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  if (IS_DEMO) return { ok: false, error: 'Preview mode — connect Supabase to save your profile.' }
  const session = await getSessionUser()
  if (!session) return { ok: false, error: 'Not signed in.' }

  const fullName = String(formData.get('full_name') || '').trim()
  const phone = String(formData.get('phone') || '').trim()
  if (fullName.length < 2) return { ok: false, error: 'Please enter your full name.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('inspector_profiles')
    .update({ full_name: fullName, phone: phone || null })
    .eq('id', session.id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/settings')
  return { ok: true }
}
