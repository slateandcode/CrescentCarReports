'use client'

import { useRef } from 'react'
import { AlertTriangle, Camera, Wand2 } from 'lucide-react'
import type { ChecklistItemDef } from '@/lib/report-templates'
import type { ChecklistItemState, ChecklistStatus, PhotoRef } from '@/lib/report-types'
import { itemStatus, isIssue, decodeDot } from '@/lib/report-utils'
import { generateComment, generateAccidentComment, ACCIDENT_PRESETS, type AccidentPreset } from '@/lib/issues'
import { StatusSegmentedControl } from './StatusControl'
import { PhotoUploader } from './PhotoUploader'
import { PolishButton } from './PolishButton'
import { cn } from '@/lib/utils'

interface Props {
  reportId: string
  sectionId: string
  item: ChecklistItemDef
  state: ChecklistItemState
  onChange: (next: ChecklistItemState | ((prev: ChecklistItemState) => ChecklistItemState)) => void
  /** Common-fault tick-boxes for this section. */
  commonIssues?: string[]
  /** Per-corner tyre: manufacturer / date / tread + photos are mandatory. */
  tyre?: boolean
  /** Accident-history single check: choose one preset result (Pass / Minor / Major). */
  accident?: boolean
}

export function ChecklistItemCard({
  reportId,
  sectionId,
  item,
  state,
  onChange,
  commonIssues = [],
  tyre = false,
  accident = false,
}: Props) {
  const status = itemStatus(state)
  const showIssue = isIssue(status)
  const photos = state.photos ?? []
  const selected = state.commonIssues ?? []
  // Once the inspector edits the comment, stop auto-overwriting it. Initialise from
  // the persisted `commentManual` flag, NOT comment presence — auto-generated
  // comments are saved too, so checking presence would wrongly lock regeneration
  // on every reloaded draft.
  const manualRef = useRef<boolean>(state.commentManual === true)

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
  /** Accident: pick one preset (or null = Pass / no record). Sets status + comment. */
  function selectAccidentPreset(preset: AccidentPreset | null) {
    const next: ChecklistItemState = {
      ...state,
      status: preset ? preset.severity : 'pass',
      commonIssues: preset ? [preset.label] : [],
    }
    if (!manualRef.current) {
      next.comment = generateAccidentComment(preset)
      next.commentManual = false
    }
    onChange(next)
  }
  function regenerateAccident() {
    manualRef.current = false
    const preset = ACCIDENT_PRESETS.find((p) => p.label === selected[0]) ?? null
    onChange({ ...state, comment: generateAccidentComment(preset), commentManual: false })
  }
  // Photo mutations are ASYNC (upload resolves later), so they must merge against
  // the latest item state via the functional updater — not the render-time `state`
  // closure, which would silently overwrite a comment/status the inspector edited
  // while the upload was in flight (routine on slow mobile connections).
  function addPhotos(newPhotos: PhotoRef[]) {
    onChange((prev) => ({ ...prev, photos: [...(prev.photos ?? []), ...newPhotos] }))
  }
  function removePhoto(photo: PhotoRef) {
    onChange((prev) => ({ ...prev, photos: (prev.photos ?? []).filter((p) => p.id !== photo.id) }))
  }
  function updatePhoto(photo: PhotoRef) {
    onChange((prev) => ({
      ...prev,
      photos: (prev.photos ?? []).map((p) => (p.id === photo.id ? photo : p)),
    }))
  }

  const needsPhoto = showIssue && photos.length === 0
  const tyreIncomplete =
    tyre && Boolean(status) && (!state.tyreManufacturer?.trim() || !state.tyreDate?.trim() || photos.length === 0)

  // Accident History: a single check chosen from preset findings. Photos are
  // optional here (it's a records search, not a physical finding).
  if (accident) {
    const selectedLabel = selected[0]
    const optionBase =
      'flex items-center justify-between gap-2 rounded-input border px-3 py-2 text-left text-sm transition-colors'
    return (
      <div
        className={cn(
          'rounded-input border bg-surface p-3 transition-colors',
          status === 'major' ? 'border-fail/40' : status === 'minor' ? 'border-attention/40' : 'border-border',
        )}
      >
        <p className="mb-2.5 text-sm font-medium text-text-primary">{item.title}</p>

        <div className="grid grid-cols-1 gap-1.5">
          <button
            type="button"
            onClick={() => selectAccidentPreset(null)}
            className={cn(
              optionBase,
              status === 'pass'
                ? 'border-accent bg-accent-muted text-text-primary'
                : 'border-border text-text-secondary hover:border-border-hover',
            )}
          >
            No accident record found (Pass)
          </button>
          {ACCIDENT_PRESETS.map((p) => {
            const active = selectedLabel === p.label
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => selectAccidentPreset(p)}
                className={cn(
                  optionBase,
                  active
                    ? 'border-accent bg-accent-muted text-text-primary'
                    : 'border-border text-text-secondary hover:border-border-hover',
                )}
              >
                <span>{p.label}</span>
                <span
                  className={cn(
                    'shrink-0 text-xs font-semibold',
                    p.severity === 'major' ? 'text-fail' : 'text-attention',
                  )}
                >
                  [{p.severity === 'major' ? 'Major' : 'Minor'}]
                </span>
              </button>
            )
          })}
        </div>

        {status && (
          <div className="mt-3 space-y-3 border-t border-border pt-3">
            <div>
              <div className="flex items-center justify-between gap-2">
                <p className="label-base !mb-0">Report comment</p>
                <div className="flex items-center gap-3">
                  <PolishButton text={state.comment ?? ''} onPolished={setComment} />
                  <button
                    type="button"
                    onClick={regenerateAccident}
                    className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-hover"
                  >
                    <Wand2 size={12} /> Auto-write
                  </button>
                </div>
              </div>
              <textarea
                value={state.comment ?? ''}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Customer-facing comment (auto-generated, editable)…"
                className="input-base mt-1.5 min-h-[64px] resize-y text-sm"
              />
            </div>

            <div>
              <div className="flex items-center justify-between gap-2">
                <p className="label-base !mb-0">Inspector note (optional)</p>
                <PolishButton text={state.notes ?? ''} onPolished={setNotes} />
              </div>
              <textarea
                value={state.notes ?? ''}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Internal note / extra detail…"
                className="input-base mt-1.5 min-h-[48px] resize-y text-sm"
              />
            </div>

            <div>
              <p className="label-base flex items-center gap-1.5">
                <Camera size={13} />
                Photos
                <span className="font-normal normal-case text-text-muted">(optional)</span>
              </p>
              <PhotoUploader
                reportId={reportId}
                photos={photos}
                target={{ sectionId, itemId: item.id }}
                onAdd={addPhotos}
                onRemove={removePhoto}
                onUpdate={updatePhoto}
              />
            </div>
          </div>
        )}
      </div>
    )
  }

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
            {/* Live preview of how the DOT decodes on the customer report. */}
            {state.tyreDate?.trim() && decodeDot(state.tyreDate) !== state.tyreDate.trim() && (
              <span className="mt-1 block text-xs text-text-muted">
                Shows on report as: {decodeDot(state.tyreDate)}
              </span>
            )}
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
            <div className="flex items-center justify-between gap-2">
              <p className="label-base !mb-0">Report comment</p>
              <div className="flex items-center gap-3">
                <PolishButton text={state.comment ?? ''} onPolished={setComment} />
                <button
                  type="button"
                  onClick={regenerate}
                  className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-hover"
                >
                  <Wand2 size={12} /> Auto-write
                </button>
              </div>
            </div>
            <textarea
              value={state.comment ?? ''}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Customer-facing comment (auto-generated, editable)…"
              className="input-base mt-1.5 min-h-[64px] resize-y text-sm"
            />
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="label-base !mb-0">Inspector note (optional)</p>
              <PolishButton text={state.notes ?? ''} onPolished={setNotes} />
            </div>
            <textarea
              value={state.notes ?? ''}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal note / extra detail…"
              className="input-base mt-1.5 min-h-[48px] resize-y text-sm"
            />
          </div>
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
            onAdd={addPhotos}
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
