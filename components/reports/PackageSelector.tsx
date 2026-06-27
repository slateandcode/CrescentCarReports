'use client'

import { useState } from 'react'
import { Check, Star } from 'lucide-react'
import { PACKAGE_LIST } from '@/lib/report-templates'
import { createReport } from '@/app/(app)/reports/actions'
import { Spinner } from '@/components/ui/Spinner'
import { cn } from '@/lib/utils'
import type { PackageType } from '@/lib/report-types'

export function PackageSelector() {
  const [pending, setPending] = useState<PackageType | null>(null)

  async function choose(pkg: PackageType) {
    if (pending) return
    setPending(pkg)
    try {
      await createReport(pkg)
    } catch {
      setPending(null)
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {PACKAGE_LIST.map((pkg) => (
        <div
          key={pkg.id}
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
            onClick={() => choose(pkg.id)}
            disabled={pending !== null}
            className={cn('mt-5 w-full', pkg.popular ? 'btn-primary' : 'btn-secondary')}
          >
            {pending === pkg.id ? <Spinner /> : `Start ${pkg.name} report`}
          </button>
        </div>
      ))}
    </div>
  )
}
