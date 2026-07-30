'use client'

import { useState } from 'react'
import { Check, Star } from 'lucide-react'
import { REPORT_OPTIONS } from '@/lib/report-templates'
import { createReport } from '@/app/(app)/reports/actions'
import { Spinner } from '@/components/ui/Spinner'
import { cn } from '@/lib/utils'

export function PackageSelector() {
  // Keyed on the option key, not the package: Premium and Alpha are both the
  // 'premium' package, and a shared key would spin both buttons at once.
  const [pending, setPending] = useState<string | null>(null)

  async function choose(option: (typeof REPORT_OPTIONS)[number]) {
    if (pending) return
    setPending(option.key)
    try {
      await createReport(option.packageType, option.brand)
    } catch {
      setPending(null)
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {REPORT_OPTIONS.map((pkg) => (
        <div
          key={pkg.key}
          className={cn(
            'relative flex flex-col rounded-card-lg border bg-card p-5 transition-colors',
            pkg.popular ? 'border-accent/50' : 'border-border',
          )}
        >
          {pkg.popular && (
            <span className="absolute -top-3 left-5 inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-black">
              <Star size={12} fill="currentColor" /> Most Popular
            </span>
          )}

          <div className="flex items-baseline justify-between">
            <h3 className="text-xl font-bold text-text-primary">{pkg.name}</h3>
            <div className="text-right">
              <span className="text-xs text-text-muted">AED</span>{' '}
              <span className="text-2xl font-bold text-accent">{pkg.price}</span>
            </div>
          </div>
          <p className="mt-0.5 text-sm font-semibold text-text-secondary">{pkg.pointLabel}</p>
          <p className="mt-2 text-sm text-text-secondary">{pkg.description}</p>

          <ul className="mt-4 flex-1 space-y-1.5">
            {pkg.features.map((f) => {
              const heading = f.endsWith('plus:')
              return (
                <li
                  key={f}
                  className={cn(
                    'flex items-start gap-2 text-sm',
                    heading ? 'font-semibold text-text-primary' : 'text-text-secondary',
                  )}
                >
                  {!heading && <Check size={15} className="mt-0.5 shrink-0 text-accent" />}
                  <span>{f}</span>
                </li>
              )
            })}
          </ul>

          <button
            onClick={() => choose(pkg)}
            disabled={pending !== null}
            className={cn('mt-5 w-full', pkg.popular ? 'btn-primary' : 'btn-secondary')}
          >
            {pending === pkg.key ? <Spinner /> : pkg.ctaLabel}
          </button>
        </div>
      ))}
    </div>
  )
}
