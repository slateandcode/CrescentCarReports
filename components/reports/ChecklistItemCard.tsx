'use client'

import { useRef } from 'react'
import { AlertTriangle, Camera, Wand2 } from 'lucide-react'
import type { ChecklistItemDef } from '@/lib/report-templates'
import type { ChecklistItemState, ChecklistStatus, PhotoRef } from '@/lib/report-types'
import { itemStatus, isIssue } from '@/lib/report-utils'
import { generateComment } from '@/lib/issues'
import { StatusSegmentedControl } from './StatusControl'
import { PhotoUploader } from './PhotoUploader'
import { cn } from '@/lib/utils'

interface Props {
  reportId: string
  sectionId: string
  item: ChecklistItemDef
  state: ChecklistItemState
  onChange: (next: ChecklistItemState) => void
  /** Common-fault tick-boxes for this section. */
  commonIssues?: string[]
  /** Per-corner tyre: manufacturer / date / tread + photos are mandatory. */
  tyre?: boolean
}

export function ChecklistItemCard({
  reportId,
  sectionId,
  item,
  state,
  onChange,
  commonIssues = [],
  tyre = false,
}: Props) {
  const status = itemStatus(state)
  const showIssue = isIssue(status)
  const photos = state.photos ?? []
  const selected = state.commonIssues ?? []
  // Once the inspector edits the comment, stop auto-overwriting it.
  const manualRef = useRef<boolean>(Boolean(state.comment && state.comment.trim()))

  function regen(next: ChecklistItemState): string {
    const s = itemStatus(next)
    if (!isIssue(s)) return next.comment ?? ''
    return generateComment({
      itemTitle: item.title,
      status: s as ChecklistStatus,
      issues: next.commonIssues ?? [],
      affectedArea: next.affectedArea,
    })
  }

  function commit(next: ChecklistItemState) {
    if (!manualRef.current) next = { ...next, comment: regen(next), commentManual: false }
    onChange(next)
  }

  function setStatus(next: ChecklistStatus) {
    commit({ ...state, status: next })
  }
  function toggleIssue(label: string) {
    const has = selected.includes(label)
    const commonIssuesNext = has ? selected.filter((l) => l !== label) : [...selected, label]
    commit({ ...state, commonIssues: commonIssuesNext })
  }
  function setAffectedArea(affectedArea: string) {
    commit({ ...state, affectedArea })
  }
  function setComment(comment: string) {
    manualRef.current = comment.trim().length > 0
    onChange({ ...state, comment, commentManual: manualRef.current })
  }
  function regenerate() {
    manualRef.current = false
    onChange({ ...state, comment: regen(state), commentManual: false })
  }
  function setNotes(notes: string) {
    onChange({ ...state, notes })
  }
  function setTyre(field: 'tyreManufacturer' | 'tyreDate' | 'tread', value: string) {
    onChange({ ...state, [field]: value })
  }
  function addPhoto(photo: PhotoRef) {
    onChange({ ...state, photos: [...photos, photo] })
  }
  function removePhoto(photo: PhotoRef) {
    onChange({ ...state, photos: photos.filter((p) => p.id !== photo.id) })
  }
  function updatePhoto(photo: PhotoRef) {
    onChange({ ...state, photos: photos.map((p) => (p.id === photo.id ? photo : p)) })
  }

  const needsPhoto = showIssue && photos.length === 0
  const tyreIncomplete =
    tyre && Boolean(status) && (!state.tyreManufacturer?.trim() || !state.tyreDate?.trim() || photos.length === 0)

  return (
    <div
      className={cn(
        'rounded-input border bg-surface p-3 transition-colors',
        status === 'major'
          ? 'border-fail/40'
          : status === 'minor'
            ? 'border-attention/40'
            : 'border-border',
      )}
    >
      <p className="mb-2.5 text-sm font-medium text-text-primary">{item.title}</p>

      <StatusSegmentedControl value={status} onChange={setStatus} />

      {item.hint && !showIssue && <p className="mt-2 text-xs text-text-muted">{item.hint}</p>}

      {/* Tyre evidence is mandatory regardless of status. */}
      {tyre && (
        <div className="mt-3 grid grid-cols-1 gap-2 xs:grid-cols-2">
          <label className="block">
            <span className="label-base">Manufacturer</span>
            <input
              value={state.tyreManufacturer ?? ''}
              onChange={(e) => setTyre('tyreManufacturer', e.target.value)}
              placeholder="e.g. Michelin"
              className="input-base text-sm"
            />
          </label>
          <label className="block">
            <span className="label-base">Date code (DOT)</span>
            <input
              value={state.tyreDate ?? ''}
              onChange={(e) => setTyre('tyreDate', e.target.value)}
              placeholder="e.g. 0419"
              className="input-base text-sm"
            />
          </label>
          <label className="col-span-2 block">
            <span className="label-base">Tread depth (optional)</span>
            <input
              value={state.tread ?? ''}
              onChange={(e) => setTyre('tread', e.target.value)}
              placeholder="e.g. 5.0 mm"
              className="input-base text-sm"
            />
          </label>
        </div>
      )}

      {showIssue && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          {commonIssues.length > 0 && (
            <div>
              <p className="label-base">Common faults</p>
              <div className="flex flex-wrap gap-1.5">
                {commonIssues.map((label) => {
                  const active = selected.includes(label)
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => toggleIssue(label)}
                      className={cn(
                        'rounded-tag border px-2.5 py-1 text-xs font-medium transition-colors',
                        active
                          ? 'border-accent bg-accent-muted text-accent'
                          : 'border-border bg-surface text-text-secondary hover:border-border-hover',
                      )}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <label className="block">
            <span className="label-base">Affected area (optional)</span>
            <input
              value={state.affectedArea ?? ''}
              onChange={(e) => setAffectedArea(e.target.value)}
              placeholder="e.g. Rear bumper"
              className="input-base text-sm"
            />
          </label>

          <div>
            <div className="flex items-center justify-between">
              <p className="label-base !mb-0">Report comment</p>
              <button
                type="button"
                onClick={regenerate}
                className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-hover"
              >
                <Wand2 size={12} /> Auto-write
              </button>
            </div>
            <textarea
              value={state.comment ?? ''}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Customer-facing comment (auto-generated, editable)…"
              className="input-base mt-1.5 min-h-[64px] resize-y text-sm"
            />
          </div>

          <label className="block">
            <span className="label-base">Inspector note (optional)</span>
            <textarea
              value={state.notes ?? ''}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal note / extra detail…"
              className="input-base min-h-[48px] resize-y text-sm"
            />
          </label>
        </div>
      )}

      {/* Photos — always available; mandatory for issues + tyres. */}
      {(showIssue || tyre || photos.length > 0) && (
        <div className={cn(showIssue ? '' : 'mt-3 border-t border-border pt-3')}>
          <p className="label-base flex items-center gap-1.5">
            <Camera size={13} />
            Photos
            {(showIssue || tyre) && <span className="font-normal normal-case text-text-muted">(required)</span>}
          </p>
          <PhotoUploader
            reportId={reportId}
            photos={photos}
            target={{ sectionId, itemId: item.id }}
            onAdd={addPhoto}
            onRemove={removePhoto}
            onUpdate={updatePhoto}
          />
          {(needsPhoto || tyreIncomplete) && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-attention">
              <AlertTriangle size={12} />
              {tyreIncomplete
                ? 'Tyre manufacturer, date code and a photo are required.'
                : 'At least one evidence photo is required.'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
