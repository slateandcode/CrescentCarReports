'use client'

import Link from 'next/link'
import { Check, Cloud, CloudOff, Loader2, Save, Eye, BadgeCheck, Send } from 'lucide-react'
import type { ReportCounts, ReportStatus, PackageType } from '@/lib/report-types'
import { completionPercent } from '@/lib/report-utils'
import { getPackage } from '@/lib/report-templates'
import { ReportStatusBadge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { cn, normalizePhoneForWa } from '@/lib/utils'

export type SaveState = 'saved' | 'unsaved' | 'saving' | 'error'

function SaveIndicator({ state }: { state: SaveState }) {
  const map = {
    saved: { icon: <Cloud size={14} />, label: 'Saved', cls: 'text-pass' },
    unsaved: { icon: <CloudOff size={14} />, label: 'Unsaved changes', cls: 'text-attention' },
    saving: { icon: <Loader2 size={14} className="animate-spin" />, label: 'Saving…', cls: 'text-text-secondary' },
    error: { icon: <CloudOff size={14} />, label: 'Save failed', cls: 'text-fail' },
  }[state]
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', map.cls)}>
      {map.icon}
      {map.label}
    </span>
  )
}

/** Sticky report header: reference, package, status, completion, counts, save state. */
export function ReportTopBar({
  reference,
  pkg,
  status,
  counts,
  score,
  saveState,
}: {
  reference: string
  pkg: PackageType
  status: ReportStatus
  counts: ReportCounts
  score?: number | null
  saveState: SaveState
}) {
  const pct = completionPercent(counts)
  const chips = [
    { label: 'Pass', value: counts.pass, cls: 'text-pass' },
    { label: 'Minor', value: counts.minor, cls: 'text-attention' },
    { label: 'Major', value: counts.major, cls: 'text-fail' },
  ]
  const scoreCls =
    score == null ? 'text-text-muted' : score >= 85 ? 'text-pass' : score >= 65 ? 'text-attention' : 'text-fail'

  return (
    <div className="no-print sticky top-0 z-20 -mx-4 border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur sm:-mx-6 sm:px-6">
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm font-semibold text-accent">{reference}</span>
        <span className="rounded-tag border border-border bg-surface px-1.5 py-0.5 text-xs font-semibold text-text-secondary">
          {getPackage(pkg).name}
        </span>
        <ReportStatusBadge status={status} />
        <span className="ml-auto flex items-center gap-3">
          {score != null && (
            <span className={cn('text-xs font-bold tabular-nums', scoreCls)}>{score}/100</span>
          )}
          <SaveIndicator state={saveState} />
        </span>
      </div>

      <div className="mt-2 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-card">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs font-semibold tabular-nums text-text-secondary">{pct}%</span>
        <div className="hidden items-center gap-2.5 xs:flex">
          {chips.map((c) => (
            <span key={c.label} className={cn('text-xs font-semibold tabular-nums', c.cls)}>
              {c.value} {c.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

/** wa.me click-to-chat link with a pre-filled message (no file — the inspector
 *  attaches the PDF by hand). Empty when there's no usable phone number. */
function whatsappShareUrl(phone: string | null | undefined, vehicleLabel: string): string {
  const digits = normalizePhoneForWa(phone)
  if (!digits) return ''
  const text = `Here is your ${vehicleLabel} inspection report from Crescent Car Check.`
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

/** Sticky bottom action bar: Save Draft, Preview, Mark Completed / Share. */
export function StickyReportActions({
  reportId,
  status,
  saving,
  completing,
  onSave,
  onComplete,
  customerPhone,
  vehicleLabel,
}: {
  reportId: string
  status: ReportStatus
  saving: boolean
  completing: boolean
  onSave: () => void
  onComplete: () => void
  customerPhone?: string | null
  vehicleLabel: string
}) {
  const waUrl = whatsappShareUrl(customerPhone, vehicleLabel)
  return (
    <div className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 px-4 pb-[env(safe-area-inset-bottom)] pt-2.5 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-2">
        <button onClick={onSave} disabled={saving} className="btn-secondary h-11 flex-1 text-sm sm:flex-none">
          {saving ? <Spinner /> : <Save size={16} />}
          <span className="hidden sm:inline">Save Draft</span>
          <span className="sm:hidden">Save</span>
        </button>
        <Link href={`/reports/${reportId}/preview`} className="btn-secondary h-11 flex-1 text-sm sm:flex-none">
          <Eye size={16} />
          Preview
        </Link>
        {status === 'completed' ? (
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden items-center gap-1.5 px-1 text-sm font-semibold text-pass xs:inline-flex">
              <Check size={16} /> Completed
            </span>
            {waUrl ? (
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary h-11 text-sm"
                title="Open WhatsApp to the customer with a pre-filled message (attach the PDF yourself)"
              >
                <Send size={16} />
                <span className="hidden sm:inline">Share via WhatsApp</span>
                <span className="sm:hidden">WhatsApp</span>
              </a>
            ) : (
              <span className="px-2 text-xs text-text-muted">No customer phone on file</span>
            )}
          </div>
        ) : (
          <button onClick={onComplete} disabled={completing} className="btn-primary ml-auto h-11 flex-1 text-sm sm:flex-none">
            {completing ? <Spinner /> : <BadgeCheck size={16} />}
            <span className="hidden sm:inline">Mark Completed</span>
            <span className="sm:hidden">Complete</span>
          </button>
        )}
      </div>
    </div>
  )
}
