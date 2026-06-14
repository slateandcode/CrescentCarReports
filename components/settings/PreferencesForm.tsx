'use client'

import { useEffect, useState } from 'react'
import { Sun, Moon } from 'lucide-react'
import { cn } from '@/lib/utils'

type Theme = 'light' | 'dark'

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
]

const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1 year

/**
 * Appearance toggle. Applies the theme instantly by switching the `data-theme`
 * attribute on <html> (all shell colours are CSS variables keyed off it) and
 * persists the choice in a `theme` cookie, which the server layout reads to
 * render the right palette on first paint (no flash, no client boot script).
 * Per-device, not per-account — theme is a lighting/readability preference.
 */
export function PreferencesForm() {
  // Start from the SSR default (dark) to match the server HTML, then sync to the
  // value the server actually rendered onto <html> from the theme cookie.
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from the SSR data-theme
    setTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark')
  }, [])

  function apply(next: Theme) {
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    // eslint-disable-next-line react-hooks/immutability -- setting a cookie is the intended side effect of this click handler
    document.cookie = `theme=${next}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`
  }

  return (
    <div>
      <p className="label-base">Appearance</p>
      <div className="grid max-w-xs grid-cols-2 gap-1.5">
        {OPTIONS.map(({ value, label, icon: Icon }) => {
          const active = theme === value
          return (
            <button
              key={value}
              type="button"
              onClick={() => apply(value)}
              aria-pressed={active}
              className={cn(
                'flex min-h-[44px] items-center justify-center gap-2 rounded-input border text-sm font-semibold transition-colors',
                active
                  ? 'border-accent bg-accent-muted text-accent'
                  : 'border-border bg-surface text-text-secondary hover:border-border-hover',
              )}
            >
              <Icon size={16} />
              {label}
            </button>
          )
        })}
      </div>
      <p className="mt-1.5 text-xs text-text-muted">
        Choose a light or dark interface — handy in bright sunlight. Saved on this device.
      </p>
    </div>
  )
}
