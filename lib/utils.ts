import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Conditional + conflict-free Tailwind class merge. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Crescent Car Reports'
export const BRAND_NAME = 'Crescent Car Check'
export const PHOTO_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_PHOTO_BUCKET || 'report-photos'

/** True when an ISO timestamp is in the past. Lives outside components so it
 *  can read the clock without tripping the react purity lint rule. */
export function isPast(iso: string): boolean {
  return new Date(iso).getTime() < Date.now()
}

/**
 * Normalise a stored phone number to the digits-only E.164 form wa.me needs.
 * Phones are stored with spaces / "+" (e.g. "+971 50 123 4567"). A leading "00"
 * international prefix is converted to no-prefix; everything non-digit is dropped.
 * Returns '' when there are no digits.
 */
export function normalizePhoneForWa(phone?: string | null): string {
  let digits = (phone ?? '').replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  return digits
}

/** Unguessable id for public report links (URL-safe, ~22 chars). */
export function generatePublicId(): string {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Cryptographically-random invite token. */
export function generateInviteToken(): string {
  const bytes = new Uint8Array(24)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
