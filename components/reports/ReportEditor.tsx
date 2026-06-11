'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Settings2, User, Car, ClipboardList, Images } from 'lucide-react'
import { getTemplate } from '@/lib/report-templates'
import { computeCounts, overallScore, recommendationFromScore, normalizeRecommendation } from '@/lib/report-utils'
import { validateForCompletion } from '@/lib/report-validation'
import { saveReport, completeReport, type ReportPatch } from '@/app/(app)/reports/actions'
import { PAINT_SECTION_ID } from '@/lib/issues'
import type {
  InspectionReport,
  ChecklistData,
  ChecklistItemState,
  PaintCondition,
  PhotoRef,
} from '@/lib/report-types'
import { REGIONAL_SPECS, TRANSMISSIONS, FUEL_TYPES, EMIRATES, VEHICLE_PLACEHOLDERS } from '@/lib/options'
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
  | 'summary_call_notes'
> & {
  checklist: ChecklistData
  photos: PhotoRef[]
}

export function ReportEditor({
  report,
  inspectorName,
}: {
  report: InspectionReport
  inspectorName: string
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
    summary_call_notes: report.summary_call_notes,
    checklist: report.checklist || {},
    photos: report.photos || [],
  }))

  const [status, setStatus] = useState(report.status)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [saving, setSaving] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [completeError, setCompleteError] = useState<string | null>(null)

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

  useEffect(() => {
    formRef.current = form
  }, [form])

  const doSave = useCallback(async (): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    setSaving(true)
    setSaveState('saving')
    const f = formRef.current
    // Manual findings are no longer authored here — the server re-derives auto
    // findings from Major issues.
    const patch: ReportPatch = { ...f, critical_findings: [] }
    const result = await saveReport(report.id, patch)
    setSaving(false)
    if (result.ok) {
      dirtyRef.current = false
      setSaveState('saved')
      return true
    }
    setSaveState('error')
    return false
  }, [report.id])

  // Debounced autosave whenever the form changes after the first render.
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    dirtyRef.current = true
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
  function setItem(sectionId: string, itemId: string, next: ChecklistItemState) {
    setForm((prev) => ({
      ...prev,
      checklist: {
        ...prev.checklist,
        [sectionId]: { ...(prev.checklist[sectionId] || {}), [itemId]: next },
      },
    }))
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
    const saved = await doSave()
    if (!saved) {
      setCompleting(false)
      setCompleteError('Could not save before completing. Try again.')
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

  const validation = validateForCompletion({ ...report, ...form, status } as InspectionReport)

  return (
    <div className="pb-24">
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
              <TextField
                label="Inspection time"
                type="time"
                value={form.inspection_time ?? ''}
                onChange={(e) => setText('inspection_time', e.target.value)}
              />
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
              value={form.vehicle_make ?? ''}
              onChange={(e) => patch({ vehicle_make: e.target.value })}
              placeholder={VEHICLE_PLACEHOLDERS.make}
            />
            <TextField
              label="Vehicle model"
              value={form.vehicle_model ?? ''}
              onChange={(e) => patch({ vehicle_model: e.target.value })}
              placeholder={VEHICLE_PLACEHOLDERS.model}
            />
            <TextField
              label="Vehicle year"
              optional
              value={form.vehicle_year ?? ''}
              onChange={(e) => setText('vehicle_year', e.target.value)}
              placeholder={VEHICLE_PLACEHOLDERS.year}
            />
            <TextField
              label="VIN / chassis number"
              optional
              value={form.vin ?? ''}
              onChange={(e) => setText('vin', e.target.value)}
              placeholder={VEHICLE_PLACEHOLDERS.vin}
            />
            <TextField
              label="Plate number"
              optional
              value={form.plate_number ?? ''}
              onChange={(e) => setText('plate_number', e.target.value)}
              placeholder={VEHICLE_PLACEHOLDERS.plate}
            />
            <TextField
              label="Odometer"
              optional
              value={form.odometer ?? ''}
              onChange={(e) => setText('odometer', e.target.value)}
              placeholder={VEHICLE_PLACEHOLDERS.odometer}
            />
            <SelectField
              label="Regional specs"
              optional
              options={REGIONAL_SPECS}
              value={form.regional_specs ?? ''}
              onChange={(e) => setText('regional_specs', e.target.value)}
            />
            <SelectField
              label="Transmission"
              optional
              options={TRANSMISSIONS}
              value={form.transmission ?? ''}
              onChange={(e) => setText('transmission', e.target.value)}
            />
            <SelectField
              label="Fuel type"
              optional
              options={FUEL_TYPES}
              value={form.fuel_type ?? ''}
              onChange={(e) => setText('fuel_type', e.target.value)}
            />
            <TextField
              label="Engine size"
              optional
              value={form.engine_size ?? ''}
              onChange={(e) => setText('engine_size', e.target.value)}
              placeholder={VEHICLE_PLACEHOLDERS.engine}
            />
            <TextField
              label="Exterior colour"
              optional
              value={form.exterior_colour ?? ''}
              onChange={(e) => setText('exterior_colour', e.target.value)}
              placeholder={VEHICLE_PLACEHOLDERS.colour}
            />
            <SelectField
              label="Inspection location"
              optional
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

        {/* General photos */}
        <SectionAccordion title="General Photo Gallery" subtitle="Extra photos for the report" icon={<Images size={18} />}>
          <PhotoUploader
            reportId={report.id}
            photos={form.photos}
            target={{ sectionId: 'general' }}
            onAdd={(photo) => patch({ photos: [...form.photos, photo] })}
            onRemove={(photo) => patch({ photos: form.photos.filter((p) => p.id !== photo.id) })}
            onUpdate={(photo) => patch({ photos: form.photos.map((p) => (p.id === photo.id ? photo : p)) })}
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
              summary_call_notes: form.summary_call_notes,
            }}
            flags={{
              recommendationEnabled: template.recommendationEnabled,
              negotiationNotesEnabled: template.negotiationNotesEnabled,
              summaryCallNotesEnabled: template.summaryCallNotesEnabled,
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
                    | 'summary_call_notes'
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

        {/* Danger zone */}
        <div className="mt-2 flex flex-col gap-3 rounded-card border border-fail/20 bg-fail-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-text-primary">Delete report</p>
            <p className="mt-0.5 text-xs text-text-secondary">
              Permanently removes this report and renumbers the rest to close the gap.
            </p>
          </div>
          <DeleteReportButton id={report.id} reference={report.report_reference} variant="editor" />
        </div>
      </div>

      <StickyReportActions
        reportId={report.id}
        status={status}
        saving={saving}
        completing={completing}
        onSave={() => void doSave()}
        onComplete={onComplete}
      />
    </div>
  )
}
