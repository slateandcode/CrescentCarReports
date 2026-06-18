'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Settings2, User, Car, ClipboardList, Armchair } from 'lucide-react'
import { getTemplate } from '@/lib/report-templates'
import { computeCounts, overallScore, recommendationFromScore, normalizeRecommendation, vehicleTitle } from '@/lib/report-utils'
import { validateForCompletion } from '@/lib/report-validation'
import { saveReport, completeReport, reopenReport, type ReportPatch } from '@/app/(app)/reports/actions'
import { PAINT_SECTION_ID } from '@/lib/issues'
import type {
  InspectionReport,
  ChecklistData,
  ChecklistItemState,
  PaintCondition,
  PhotoRef,
} from '@/lib/report-types'
import { REGIONAL_SPECS, TRANSMISSIONS, FUEL_TYPES, EMIRATES, VEHICLE_PLACEHOLDERS } from '@/lib/options'
import { SLOT_TIMES, SLOTS } from '@/lib/booking-types'
import { SectionAccordion } from './SectionAccordion'
import { ChecklistSection } from './ChecklistSection'
import { FinalRecommendationForm } from './FinalRecommendationForm'
import { MainImageUploader } from './MainImageUploader'
import { PhotoUploader } from './PhotoUploader'
import { TextField, SelectField } from '@/components/ui/Field'
import { ReportTopBar, StickyReportActions, type SaveState } from './ReportEditorBars'
import { DeleteReportButton } from './DeleteReportButton'

const AUTOSAVE_MS = 1500

/** Local editable slice of the report. */
type Form = Pick<
  InspectionReport,
  | 'customer_name'
  | 'customer_phone'
  | 'customer_email'
  | 'vehicle_make'
  | 'vehicle_model'
  | 'vehicle_year'
  | 'vin'
  | 'plate_number'
  | 'odometer'
  | 'regional_specs'
  | 'transmission'
  | 'fuel_type'
  | 'engine_size'
  | 'exterior_colour'
  | 'inspection_location'
  | 'inspection_date'
  | 'inspection_time'
  | 'main_vehicle_image_url'
  | 'buyer_recommendation'
  | 'inspector_summary'
  | 'price_negotiation_notes'
> & {
  checklist: ChecklistData
  photos: PhotoRef[]
}

export function ReportEditor({
  report,
  inspectorName,
  canDelete = false,
}: {
  report: InspectionReport
  inspectorName: string
  canDelete?: boolean
}) {
  const template = useMemo(() => getTemplate(report.package_type), [report.package_type])

  const [form, setForm] = useState<Form>(() => ({
    customer_name: report.customer_name,
    customer_phone: report.customer_phone,
    customer_email: report.customer_email,
    vehicle_make: report.vehicle_make,
    vehicle_model: report.vehicle_model,
    vehicle_year: report.vehicle_year,
    vin: report.vin,
    plate_number: report.plate_number,
    odometer: report.odometer,
    regional_specs: report.regional_specs,
    transmission: report.transmission,
    fuel_type: report.fuel_type,
    engine_size: report.engine_size,
    exterior_colour: report.exterior_colour,
    inspection_location: report.inspection_location,
    inspection_date: report.inspection_date,
    inspection_time: report.inspection_time,
    main_vehicle_image_url: report.main_vehicle_image_url,
    buyer_recommendation: normalizeRecommendation(report.buyer_recommendation) ?? null,
    inspector_summary: report.inspector_summary,
    price_negotiation_notes: report.price_negotiation_notes,
    checklist: report.checklist || {},
    photos: report.photos || [],
  }))

  const [status, setStatus] = useState(report.status)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [saving, setSaving] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [completeError, setCompleteError] = useState<string | null>(null)
  // Set when a save loses to a concurrent edit elsewhere. Once set we stop
  // autosaving (a reload is required) and show a banner; see doSave + the
  // autosave effect below.
  const [conflict, setConflict] = useState(false)

  const counts = useMemo(
    () => computeCounts(report.package_type, form.checklist),
    [report.package_type, form.checklist],
  )
  const score = useMemo(
    () => overallScore(report.package_type, form.checklist),
    [report.package_type, form.checklist],
  )
  const suggested = useMemo(() => recommendationFromScore(score), [score])

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const formRef = useRef(form)
  const dirtyRef = useRef(false)
  // Optimistic-concurrency baseline: the updated_at this editor last saw. Sent
  // as expectedUpdatedAt on each save and re-adopted from the server's response
  // so a normal run of saves from THIS editor keeps matching. A mismatch means
  // someone else saved → the server returns { conflict: true }.
  const baselineUpdatedAt = useRef(report.updated_at)
  // Guards against overlapping in-flight saves: without it a slow save could
  // resolve after a newer one and adopt a stale baseline, losing updates.
  const inFlight = useRef(false)
  // Stop autosaving once a conflict is detected (kept in a ref so the autosave
  // effect's cleanup/closure always sees the latest value).
  const conflictRef = useRef(false)
  // The in-flight save's promise, so flush()/onComplete() can await the REAL
  // result instead of treating a coalesced (in-flight) call as a failure.
  const savePromise = useRef<Promise<boolean> | null>(null)
  // Monotonic edit counter. The value at save-start is captured in savingSeq; on
  // resolve we only clear the dirty flag if no NEWER edit landed while the save
  // was in flight — so a trailing edit is never reported "Saved" without being
  // persisted (it stays dirty and the re-armed debounce retries it).
  const editSeq = useRef(0)
  const savingSeq = useRef(0)
  // Always points at the latest doSave, so doSave's own re-arm timers can retry
  // without the callback referencing itself (which the hooks linter forbids).
  const doSaveRef = useRef<(() => Promise<boolean>) | null>(null)

  useEffect(() => {
    formRef.current = form
  }, [form])

  const doSave = useCallback(async (): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    // A conflict is terminal until reload — never try to save over the winner.
    if (conflictRef.current) return false
    // Coalesce overlapping saves: if one is already in flight, don't start a
    // second. Re-arm the debounce so the trailing edit IS retried once the
    // current save settles, and hand the caller the in-flight promise so an
    // explicit flush()/complete can await the real result rather than reading
    // this coalesced call as a failure.
    if (inFlight.current) {
      timer.current = setTimeout(() => void doSaveRef.current?.(), AUTOSAVE_MS)
      return savePromise.current ?? false
    }
    inFlight.current = true
    setSaving(true)
    setSaveState('saving')
    const run = (async (): Promise<boolean> => {
      const f = formRef.current
      // Snapshot the edit counter this save covers; a higher value on resolve
      // means a newer edit arrived mid-flight and must not be marked saved.
      savingSeq.current = editSeq.current
      // Manual findings are no longer authored here — the server re-derives auto
      // findings from Major issues.
      const patch: ReportPatch = { ...f, critical_findings: [] }
      const result = await saveReport(report.id, patch, baselineUpdatedAt.current)
      inFlight.current = false
      setSaving(false)
      if (result.ok) {
        // Adopt the new baseline so the next save's precondition matches.
        if (result.updated_at) baselineUpdatedAt.current = result.updated_at
        if (editSeq.current === savingSeq.current) {
          // Nothing changed during the save — it's fully persisted.
          dirtyRef.current = false
          setSaveState('saved')
        } else {
          // A trailing edit landed mid-flight: keep it dirty and let the
          // re-armed debounce (or flush) persist it next.
          setSaveState('unsaved')
          if (!timer.current && !conflictRef.current) {
            timer.current = setTimeout(() => void doSaveRef.current?.(), AUTOSAVE_MS)
          }
        }
        return editSeq.current === savingSeq.current
      }
      if (result.conflict) {
        conflictRef.current = true
        setConflict(true)
      }
      setSaveState('error')
      return false
    })()
    savePromise.current = run
    try {
      return await run
    } finally {
      if (savePromise.current === run) savePromise.current = null
    }
  }, [report.id])

  useEffect(() => {
    doSaveRef.current = doSave
  }, [doSave])

  // Flush pending edits before an in-editor client-side navigation (Preview /
  // back-to-Reports). Autosave's beforeunload only covers full page unloads, so
  // a <Link> navigation within the 1.5s debounce would otherwise drop the last
  // edit and render a stale preview/PDF. Best-effort: we await the save but the
  // caller navigates regardless, so a failed save can't trap the user here.
  const flush = useCallback(async (): Promise<void> => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    if (conflictRef.current) return
    try {
      // Let any in-flight save land first (a coalesced doSave would otherwise
      // return immediately and we'd navigate before the write committed)…
      if (savePromise.current) await savePromise.current
      // …then persist the latest edit if anything is still unsaved, so the
      // preview/PDF renders current data rather than a stale snapshot.
      if (dirtyRef.current && !conflictRef.current) await doSave()
    } catch {
      // Swallow — navigation proceeds either way; the edit stays dirty and the
      // destination still shows the last persisted state.
    }
  }, [doSave])

  // Debounced autosave whenever the form changes after the first render.
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    // A detected conflict freezes autosave until the page is reloaded.
    if (conflictRef.current) return
    dirtyRef.current = true
    editSeq.current += 1
    setSaveState('unsaved')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void doSave(), AUTOSAVE_MS)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [form, doSave])

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (dirtyRef.current) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  // ─── field setters ──────────────────────────────────────────────────────
  function patch(p: Partial<Form>) {
    setForm((prev) => ({ ...prev, ...p }))
  }
  function setText<K extends keyof Form>(key: K, value: string) {
    patch({ [key]: value === '' ? null : (value as Form[K]) } as Partial<Form>)
  }
  // Accepts a value OR a React-style updater. The updater form is essential for
  // the async photo handlers: an upload that resolves after the inspector has
  // edited the same item must merge against the LATEST item state, not the stale
  // render-time closure (which would clobber the just-typed comment/status).
  function setItem(
    sectionId: string,
    itemId: string,
    next: ChecklistItemState | ((prev: ChecklistItemState) => ChecklistItemState),
  ) {
    setForm((prev) => {
      const section = prev.checklist[sectionId] || {}
      const current = section[itemId] || {}
      const value = typeof next === 'function' ? next(current) : next
      return {
        ...prev,
        checklist: { ...prev.checklist, [sectionId]: { ...section, [itemId]: value } },
      }
    })
  }
  function setPaint(panelId: string, condition: PaintCondition) {
    setForm((prev) => ({
      ...prev,
      checklist: {
        ...prev.checklist,
        [PAINT_SECTION_ID]: {
          ...(prev.checklist[PAINT_SECTION_ID] || {}),
          [panelId]: { paint: condition },
        },
      },
    }))
  }

  async function onComplete() {
    setCompleteError(null)
    const candidate = { ...report, ...form, status } as InspectionReport
    const local = validateForCompletion(candidate)
    if (!local.ok) {
      setCompleteError(local.errors.join(' '))
      return
    }
    setCompleting(true)
    // Wait for any autosave already in flight to settle so the final save below
    // isn't coalesced into a spurious failure, then persist the latest snapshot.
    if (savePromise.current) {
      try {
        await savePromise.current
      } catch {
        /* fall through to the explicit save */
      }
    }
    const saved = await doSave()
    if (!saved) {
      setCompleting(false)
      setCompleteError(
        conflictRef.current
          ? 'This report was changed elsewhere. Reload to get the latest version.'
          : 'Could not save before completing. Try again.',
      )
      return
    }
    const result = await completeReport(report.id)
    setCompleting(false)
    if (!result.ok) {
      setCompleteError(result.error || 'Could not complete the report.')
      return
    }
    setStatus('completed')
  }

  // Reverse the Completed tick — move a completed report back to draft.
  async function onReopen() {
    setCompleteError(null)
    setCompleting(true)
    const result = await reopenReport(report.id)
    setCompleting(false)
    if (!result.ok) {
      setCompleteError(result.error || 'Could not reopen the report.')
      return
    }
    setStatus('draft')
  }

  const validation = validateForCompletion({ ...report, ...form, status } as InspectionReport)

  return (
    <div className="pb-36">
      <ReportTopBar
        reference={report.report_reference}
        pkg={report.package_type}
        status={status}
        counts={counts}
        score={score}
        saveState={saveState}
      />

      <div className="mt-4 space-y-3">
        {/* 1. Report Setup */}
        <SectionAccordion
          title="Report Setup"
          subtitle="Package, schedule and main vehicle photo"
          icon={<Settings2 size={18} />}
          defaultOpen
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="label-base">Package</p>
                <p className="rounded-input border border-border bg-surface px-3 py-2.5 text-sm font-semibold text-accent">
                  {template.name} · {template.pointLabel}
                </p>
              </div>
              <div>
                <p className="label-base">Reference</p>
                <p className="rounded-input border border-border bg-surface px-3 py-2.5 font-mono text-sm text-text-primary">
                  {report.report_reference}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 xs:grid-cols-2">
              <TextField
                label="Inspection date"
                type="date"
                value={form.inspection_date ?? ''}
                onChange={(e) => setText('inspection_date', e.target.value)}
              />
              <label className="block">
                <span className="label-base">Inspection time</span>
                <select
                  className="input-base"
                  value={form.inspection_time ?? ''}
                  onChange={(e) => setText('inspection_time', e.target.value)}
                >
                  <option value="">Select…</option>
                  {SLOT_TIMES.map((t) => (
                    <option key={t} value={t}>
                      {SLOTS[t]}
                    </option>
                  ))}
                  {/* Preserve a legacy / off-slot time saved before slots were enforced. */}
                  {form.inspection_time &&
                    !(SLOT_TIMES as readonly string[]).includes(form.inspection_time) && (
                      <option value={form.inspection_time}>{form.inspection_time}</option>
                    )}
                </select>
              </label>
            </div>

            <div>
              <p className="label-base">Inspector</p>
              <p className="rounded-input border border-border bg-surface px-3 py-2.5 text-sm text-text-primary">
                {inspectorName}
              </p>
            </div>

            <div>
              <p className="label-base">Main vehicle photo</p>
              <MainImageUploader
                reportId={report.id}
                url={form.main_vehicle_image_url}
                onChange={(url) => patch({ main_vehicle_image_url: url })}
              />
            </div>
          </div>
        </SectionAccordion>

        {/* 2. Customer Details */}
        <SectionAccordion title="Customer Details" icon={<User size={18} />}>
          <div className="space-y-3">
            <TextField
              label="Customer name"
              optional
              value={form.customer_name ?? ''}
              onChange={(e) => setText('customer_name', e.target.value)}
              placeholder="Full name"
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TextField
                label="Customer phone"
                optional
                type="tel"
                value={form.customer_phone ?? ''}
                onChange={(e) => setText('customer_phone', e.target.value)}
                placeholder="+971 50 123 4567"
              />
              <TextField
                label="Customer email"
                optional
                type="email"
                value={form.customer_email ?? ''}
                onChange={(e) => setText('customer_email', e.target.value)}
                placeholder="name@email.com"
              />
            </div>
          </div>
        </SectionAccordion>

        {/* 3. Vehicle Details */}
        <SectionAccordion title="Vehicle Details" icon={<Car size={18} />} defaultOpen>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextField
              label="Vehicle make"
              required
              value={form.vehicle_make ?? ''}
              onChange={(e) => patch({ vehicle_make: e.target.value })}
              placeholder={VEHICLE_PLACEHOLDERS.make}
            />
            <TextField
              label="Vehicle model"
              required
              value={form.vehicle_model ?? ''}
              onChange={(e) => patch({ vehicle_model: e.target.value })}
              placeholder={VEHICLE_PLACEHOLDERS.model}
            />
            <TextField
              label="Vehicle year"
              required
              value={form.vehicle_year ?? ''}
              onChange={(e) => setText('vehicle_year', e.target.value)}
              placeholder={VEHICLE_PLACEHOLDERS.year}
            />
            <TextField
              label="VIN / chassis number"
              required
              value={form.vin ?? ''}
              onChange={(e) => setText('vin', e.target.value)}
              placeholder={VEHICLE_PLACEHOLDERS.vin}
            />
            <TextField
              label="Plate number"
              required
              value={form.plate_number ?? ''}
              onChange={(e) => setText('plate_number', e.target.value)}
              placeholder={VEHICLE_PLACEHOLDERS.plate}
            />
            <TextField
              label="Odometer"
              required
              value={form.odometer ?? ''}
              onChange={(e) => setText('odometer', e.target.value)}
              placeholder={VEHICLE_PLACEHOLDERS.odometer}
            />
            <SelectField
              label="Regional specs"
              required
              options={REGIONAL_SPECS}
              value={form.regional_specs ?? ''}
              onChange={(e) => setText('regional_specs', e.target.value)}
            />
            <SelectField
              label="Transmission"
              required
              options={TRANSMISSIONS}
              value={form.transmission ?? ''}
              onChange={(e) => setText('transmission', e.target.value)}
            />
            <SelectField
              label="Fuel type"
              required
              options={FUEL_TYPES}
              value={form.fuel_type ?? ''}
              onChange={(e) => setText('fuel_type', e.target.value)}
            />
            <TextField
              label="Engine size"
              required
              value={form.engine_size ?? ''}
              onChange={(e) => setText('engine_size', e.target.value)}
              placeholder={VEHICLE_PLACEHOLDERS.engine}
            />
            <TextField
              label="Exterior colour"
              required
              value={form.exterior_colour ?? ''}
              onChange={(e) => setText('exterior_colour', e.target.value)}
              placeholder={VEHICLE_PLACEHOLDERS.colour}
            />
            <SelectField
              label="Inspection location"
              required
              options={EMIRATES}
              value={form.inspection_location ?? ''}
              onChange={(e) => setText('inspection_location', e.target.value)}
            />
          </div>
        </SectionAccordion>

        {/* 4. Guided inspection */}
        <div className="pt-1">
          <h2 className="mb-2 flex items-center gap-2 px-1 text-sm font-bold uppercase tracking-wide text-text-secondary">
            <ClipboardList size={16} className="text-accent" /> Inspection · {template.sections.length} sections
          </h2>
          <div className="space-y-3">
            {template.sections.map((section) => (
              <ChecklistSection
                key={section.id}
                reportId={report.id}
                section={section}
                state={form.checklist[section.id] || {}}
                onItemChange={(itemId, next) => setItem(section.id, itemId, next)}
                paintState={section.kind === 'exterior' ? form.checklist[PAINT_SECTION_ID] || {} : undefined}
                onPaintChange={section.kind === 'exterior' ? setPaint : undefined}
              />
            ))}
          </div>
        </div>

        {/* Photo galleries — split into Exterior + Interior so inspectors upload
            in an organised way. Both are required to mark the report completed
            (see validateForCompletion). */}
        <SectionAccordion title="Exterior Photos" subtitle="Required — outside of the vehicle" icon={<Car size={18} />} defaultOpen>
          <PhotoUploader
            reportId={report.id}
            photos={form.photos.filter((p) => p.sectionId === 'gallery-exterior')}
            target={{ sectionId: 'gallery-exterior' }}
            onAdd={(newPhotos) => setForm((prev) => ({ ...prev, photos: [...prev.photos, ...newPhotos] }))}
            onRemove={(photo) => setForm((prev) => ({ ...prev, photos: prev.photos.filter((p) => p.id !== photo.id) }))}
            onUpdate={(photo) => setForm((prev) => ({ ...prev, photos: prev.photos.map((p) => (p.id === photo.id ? photo : p)) }))}
            label="Add photo"
          />
        </SectionAccordion>
        <SectionAccordion title="Interior Photos" subtitle="Required — inside the cabin" icon={<Armchair size={18} />} defaultOpen>
          <PhotoUploader
            reportId={report.id}
            photos={form.photos.filter((p) => p.sectionId === 'gallery-interior')}
            target={{ sectionId: 'gallery-interior' }}
            onAdd={(newPhotos) => setForm((prev) => ({ ...prev, photos: [...prev.photos, ...newPhotos] }))}
            onRemove={(photo) => setForm((prev) => ({ ...prev, photos: prev.photos.filter((p) => p.id !== photo.id) }))}
            onUpdate={(photo) => setForm((prev) => ({ ...prev, photos: prev.photos.map((p) => (p.id === photo.id ? photo : p)) }))}
            label="Add photo"
          />
        </SectionAccordion>

        {/* 5. Final Recommendation & Inspector Notes */}
        <SectionAccordion
          title="Final Recommendation & Inspector Notes"
          subtitle={template.recommendationEnabled ? 'Recommendation and notes' : 'Inspector notes'}
          icon={<ClipboardList size={18} />}
          defaultOpen
        >
          <FinalRecommendationForm
            values={{
              buyer_recommendation: form.buyer_recommendation,
              inspector_summary: form.inspector_summary,
              price_negotiation_notes: form.price_negotiation_notes,
            }}
            flags={{
              recommendationEnabled: template.recommendationEnabled,
              negotiationNotesEnabled: template.negotiationNotesEnabled,
            }}
            score={score}
            suggested={suggested}
            onPatch={(p) =>
              patch(
                p as Partial<
                  Pick<
                    Form,
                    | 'buyer_recommendation'
                    | 'inspector_summary'
                    | 'price_negotiation_notes'
                  >
                >,
              )
            }
          />
        </SectionAccordion>

        {/* Completion checklist */}
        {status !== 'completed' && !validation.ok && (
          <div className="rounded-card border border-attention/30 bg-attention-muted p-3 text-sm text-attention">
            <p className="font-semibold">To mark completed:</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              {validation.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
        {completeError && (
          <div className="rounded-card border border-fail/30 bg-fail-muted p-3 text-sm text-fail">
            {completeError}
          </div>
        )}

        {/* Optimistic-concurrency conflict: another tab/user saved over us.
            Autosave is frozen — the inspector must reload to get the latest. */}
        {conflict && (
          <div className="rounded-card border border-fail/30 bg-fail-muted p-3 text-sm text-fail">
            <p className="font-semibold">This report was changed elsewhere.</p>
            <p className="mt-0.5">
              Saving is paused to avoid overwriting those changes.{' '}
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="font-semibold underline underline-offset-2"
              >
                Reload
              </button>{' '}
              to get the latest version.
            </p>
          </div>
        )}

        {/* Danger zone — admin only (deletion renumbers everyone's references). */}
        {canDelete && (
          <div className="mt-2 flex flex-col gap-3 rounded-card border border-fail/20 bg-fail-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-text-primary">Delete report</p>
              <p className="mt-0.5 text-xs text-text-secondary">
                Permanently removes this report and renumbers the rest to close the gap.
              </p>
            </div>
            <DeleteReportButton id={report.id} reference={report.report_reference} variant="editor" />
          </div>
        )}
      </div>

      <StickyReportActions
        reportId={report.id}
        reference={report.report_reference}
        status={status}
        saving={saving}
        completing={completing}
        onSave={() => void doSave()}
        onComplete={onComplete}
        onReopen={onReopen}
        onNavigate={flush}
        customerPhone={form.customer_phone}
        vehicleLabel={vehicleTitle({
          vehicle_year: form.vehicle_year,
          vehicle_make: form.vehicle_make,
          vehicle_model: form.vehicle_model,
        })}
      />
    </div>
  )
}
