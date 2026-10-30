import type { InspectionReport } from '@/lib/report-types'
import { getTemplate } from '@/lib/report-templates'
import { brandConfig, effectiveBrand } from '@/lib/report-brand'
import {
  ReportCoverPage,
  ReportAlphaCoverPage,
  ReportCashCarsCoverPage,
  ReportVehicleSummaryPage,
  ReportExecutiveSummaryPage,
  ReportAccidentHistoryPage,
  ReportExteriorPage,
  ReportTyresBrakesPage,
  ScoredSectionPage,
  ReportEndoscopicPage,
  ReportPhotoGalleryPage,
  ReportFinalNotesPage,
  ReportDisclaimerPage,
} from './ReportPages'

/**
 * The full customer-facing inspection document, assembled from A4 pages in the
 * brief's order. It is data-driven and package-aware: section pages only appear
 * when the package includes that section, so a Standard report omits the
 * Underbody/Transmission, Suspension/Steering and Endoscopic pages and reads
 * shorter. Page indices are numbered sequentially over whatever renders.
 */
export function ReportDocument({
  report,
  inspectorName,
}: {
  report: InspectionReport
  inspectorName?: string | null
}) {
  const template = getTemplate(report.package_type)
  // Whose document this is. White-label (hide_branding) still wins over a brand:
  // "show no identity" is a stronger instruction than "show theirs".
  const brand = effectiveBrand(report)
  const { disclaimerPage } = report.hide_branding ? { disclaimerPage: true } : brandConfig(report)
  const present = new Set(template.sections.map((s) => s.id))
  const hasNotes = Boolean(report.inspector_summary || report.price_negotiation_notes)
  const showFinalNotes = template.recommendationEnabled || hasNotes
  // Split galleries by section tag. Legacy/untagged photos (older reports used a
  // single "general" gallery) fold into Exterior so nothing is lost.
  const allPhotos = report.photos || []
  const interiorPhotos = allPhotos.filter((p) => p.sectionId === 'gallery-interior')
  const exteriorPhotos = allPhotos.filter((p) => p.sectionId !== 'gallery-interior')

  let n = 0
  const next = () => String(++n).padStart(2, '0')

  const pages: React.ReactNode[] = []
  pages.push(
    <ReportVehicleSummaryPage key="summary" report={report} template={template} index={next()} inspectorName={inspectorName} />,
  )
  pages.push(<ReportExecutiveSummaryPage key="exec" report={report} template={template} index={next()} />)
  if (present.has('accident-history'))
    pages.push(<ReportAccidentHistoryPage key="accident" report={report} index={next()} />)
  if (present.has('exterior')) pages.push(<ReportExteriorPage key="exterior" report={report} index={next()} />)
  if (present.has('interior'))
    pages.push(<ScoredSectionPage key="interior" report={report} sectionId="interior" index={next()} />)
  if (present.has('tyres-brakes'))
    pages.push(<ReportTyresBrakesPage key="tyres" report={report} index={next()} />)
  if (present.has('engine-bay'))
    pages.push(<ScoredSectionPage key="engine" report={report} sectionId="engine-bay" index={next()} />)
  if (present.has('underbody-transmission'))
    pages.push(<ScoredSectionPage key="underbody" report={report} sectionId="underbody-transmission" index={next()} />)
  if (present.has('suspension-steering'))
    pages.push(<ScoredSectionPage key="suspension" report={report} sectionId="suspension-steering" index={next()} />)
  if (present.has('electrical-obd'))
    pages.push(<ScoredSectionPage key="electrical" report={report} sectionId="electrical-obd" index={next()} />)
  if (present.has('endoscopic'))
    pages.push(<ReportEndoscopicPage key="endoscopic" report={report} index={next()} />)
  if (exteriorPhotos.length > 0)
    pages.push(
      <ReportPhotoGalleryPage key="gallery-exterior" report={report} index={next()} title="Exterior Photos" photos={exteriorPhotos} />,
    )
  if (interiorPhotos.length > 0)
    pages.push(
      <ReportPhotoGalleryPage key="gallery-interior" report={report} index={next()} title="Interior Photos" photos={interiorPhotos} />,
    )
  if (showFinalNotes)
    pages.push(<ReportFinalNotesPage key="notes" report={report} template={template} index={next()} />)
  // Alpha asked for the legal disclaimer dropped (Cash & Cars follows suit): the
  // text names the inspection provider throughout and their legal position is
  // theirs to state.
  if (disclaimerPage) pages.push(<ReportDisclaimerPage key="disclaimer" report={report} index={next()} />)

  return (
    // Brand + white-label modifiers drive the CSS-side swaps in the shared chrome
    // (DocHeader/DocFooter/watermark — see globals.css), including re-pointing
    // --accent-rgb for the whole document. Pages that hold the report branch in
    // JSX themselves.
    // data-report-document is the render-success marker: the PDF renderers check
    // for it after page load so a 404/error/login page can never be rendered to
    // PDF, cached as this report's document and (worse) trigger the stale-version
    // sweep that deletes the good older copies. Keep it on the root of every
    // brand/white-label variant.
    <div
      data-report-document=""
      className={`report-doc bg-[#3A3A3A] print:bg-white${report.hide_branding ? ' report-doc--unbranded' : ''}${brand !== 'crescent' ? ` report-doc--${brand}` : ''}`}
    >
      {brand === 'alpha' ? (
        <ReportAlphaCoverPage />
      ) : brand === 'cashandcars' ? (
        <ReportCashCarsCoverPage />
      ) : (
        <ReportCoverPage report={report} template={template} />
      )}
      {pages}
    </div>
  )
}
