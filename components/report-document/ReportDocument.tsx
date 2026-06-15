import type { InspectionReport } from '@/lib/report-types'
import { getTemplate } from '@/lib/report-templates'
import {
  ReportCoverPage,
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
  pages.push(<ReportDisclaimerPage key="disclaimer" report={report} index={next()} />)

  return (
    <div className="report-doc bg-[#3A3A3A] print:bg-white">
      <ReportCoverPage report={report} template={template} />
      {pages}
    </div>
  )
}
