import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Pencil, Info } from 'lucide-react'
import { requireUser } from '@/lib/auth'
import { getReportWithInspector } from '@/lib/data'
import { ReportDocument } from '@/components/report-document/ReportDocument'
import { PrintButton } from '@/components/report-document/PrintButton'
import { AutoPrint } from '@/components/report-document/AutoPrint'

export const metadata = { title: 'Report preview' }
export const dynamic = 'force-dynamic'

export default async function PreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ print?: string }>
}) {
  const { id } = await params
  const { print } = await searchParams
  await requireUser()
  const result = await getReportWithInspector(id)
  if (!result) notFound()
  const { report, inspectorName } = result

  return (
    <div>
      {print === '1' && <AutoPrint />}
      {/* Toolbar — hidden in print */}
      <div className="no-print mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href={`/reports/${id}/edit`}
              className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
            >
              <ArrowLeft size={16} /> Editor
            </Link>
            <span className="font-mono text-sm font-semibold text-accent">{report.report_reference}</span>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <Link href={`/reports/${id}/edit`} className="btn-secondary h-11 flex-1 text-sm sm:flex-none">
              <Pencil size={15} /> Edit
            </Link>
            <PrintButton reportId={id} reference={report.report_reference} className="btn-primary h-11 flex-1 text-sm sm:flex-none" />
          </div>
        </div>
        {/* Guidance — the Download button is the reliable path; print is fallback. */}
        <p className="mt-2 flex items-start gap-1.5 text-xs text-text-muted">
          <Info size={13} className="mt-0.5 shrink-0 text-accent" />
          <span>
            <strong className="text-text-secondary">Download PDF</strong> generates a correctly-sized A4 file on the server.
            If you use the browser print dialog instead, set <strong className="text-text-secondary">Margins → None</strong> and turn
            <strong className="text-text-secondary"> off Headers and footers</strong> to avoid white margins.
          </span>
        </p>
      </div>

      {/* Document — breaks out of the shell padding and scrolls on small screens */}
      <div className="-mx-4 overflow-x-auto rounded-lg bg-[#3A3A3A] sm:-mx-6 print:!m-0 print:overflow-visible print:rounded-none print:bg-white">
        <ReportDocument report={report} inspectorName={inspectorName} />
      </div>
    </div>
  )
}
