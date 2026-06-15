'use client'

import Link from 'next/link'
import { Check, Cloud, CloudOff, Loader2, Save, Eye, Square, Send } from 'lucide-react'
import type { ReportCounts, ReportStatus, PackageType } from '@/lib/report-types'
import { completionPercent } from '@/lib/report-utils'
import { getPackage } from '@/lib/report-templates'
import { ReportStatusBadge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { PrintButton } from '@/components/report-document/PrintButton'
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

/** Shared look for the four action buttons (icon stacked over a small label). */
const ACTION_BTN =
  'flex h-14 flex-col items-center justify-center gap-1 rounded-input border border-border bg-card text-[11px] font-semibold text-text-secondary transition-colors hover:border-border-hover hover:bg-card-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50'

/**
 * Sticky bottom action bar. Top: a Completed tick the inspector toggles when the
 * report is finished — grey when draft, gold when completed, and reversible.
 * Bottom: the four actions Save · Preview · Download · Send. The workflow is
 * finish → tick Completed → Preview → Download the PDF → Send via WhatsApp and
 * attach the downloaded PDF by hand (wa.me can't attach files itself).
 */
export function StickyReportActions({
  reportId,
  reference,
  status,
  saving,
  completing,
  onSave,
  onComplete,
  onReopen,
  customerPhone,
  vehicleLabel,
}: {
  reportId: string
  reference: string
  status: ReportStatus
  saving: boolean
  completing: boolean
  onSave: () => void
  onComplete: () => void
  onReopen: () => void
  customerPhone?: string | null
  vehicleLabel: string
}) {
  const completed = status === 'completed'
  const waUrl = whatsappShareUrl(customerPhone, vehicleLabel)
  return (
    <div className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 px-4 pb-[env(safe-area-inset-bottom)] pt-2.5 backdrop-blur">
      <div className="mx-auto max-w-6xl space-y-2">
        {/* Completed tick — grey when draft, gold when completed. Reversible. */}
        <button
          onClick={completed ? onReopen : onComplete}
          disabled={completing}
          aria-pressed={completed}
          className={cn(
            'flex h-11 w-full items-center justify-center gap-2 rounded-input border text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60',
            completed
              ? 'border-accent bg-accent text-black hover:bg-accent-hover'
              : 'border-border bg-card text-text-secondary hover:border-border-hover hover:text-text-primary',
          )}
          title={completed ? 'Tap to reopen this report for edits' : 'Tick when the report is finished'}
        >
          {completing ? <Spinner /> : completed ? <Check size={16} /> : <Square size={16} />}
          Completed
        </button>

        {/* Four actions: Save · Preview · Download · Send. */}
        <div className="grid grid-cols-4 gap-2">
          <button onClick={onSave} disabled={saving} className={ACTION_BTN}>
            {saving ? <Spinner /> : <Save size={16} />}
            Save
          </button>
          <Link href={`/reports/${reportId}/preview`} className={ACTION_BTN}>
            <Eye size={16} />
            Preview
          </Link>
          <PrintButton
            reportId={reportId}
            reference={reference}
            label="Download"
            busyLabel="…"
            fallbackLabel="Print"
            className={ACTION_BTN}
          />
          {waUrl ? (
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={ACTION_BTN}
              title="Open WhatsApp to the customer with a pre-filled message (attach the PDF yourself)"
            >
              <Send size={16} />
              Send
            </a>
          ) : (
            <button type="button" disabled className={ACTION_BTN} title="No customer phone on file">
              <Send size={16} />
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
