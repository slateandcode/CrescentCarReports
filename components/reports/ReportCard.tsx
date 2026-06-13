import Link from 'next/link'
import { Pencil, Eye, Car, User, Calendar } from 'lucide-react'
import { format } from 'date-fns'
import type { InspectionReport } from '@/lib/report-types'
import { vehicleTitle } from '@/lib/report-utils'
import { ReportStatusBadge, PackageBadge } from '@/components/ui/Badge'
import { DeleteReportButton } from './DeleteReportButton'

export function ReportCard({
  report,
  canDelete = false,
}: {
  report: InspectionReport
  canDelete?: boolean
}) {
  const updated = report.updated_at ? format(new Date(report.updated_at), 'd MMM yyyy') : ''
  return (
    <div className="card-base p-4 transition-colors hover:border-border-hover">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-sm font-semibold text-accent">{report.report_reference}</p>
          <p className="mt-0.5 truncate text-base font-semibold text-text-primary">
            {vehicleTitle(report)}
          </p>
        </div>
        <ReportStatusBadge status={report.status} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-text-secondary">
        <span className="inline-flex items-center gap-1.5">
          <PackageBadge pkg={report.package_type} />
        </span>
        {report.customer_name && (
          <span className="inline-flex items-center gap-1.5">
            <User size={14} className="text-text-muted" />
            {report.customer_name}
          </span>
        )}
        {report.plate_number && (
          <span className="inline-flex items-center gap-1.5">
            <Car size={14} className="text-text-muted" />
            {report.plate_number}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <Calendar size={14} className="text-text-muted" />
          {updated}
        </span>
      </div>

      <div className="mt-4 flex gap-2">
        <Link href={`/reports/${report.id}/edit`} className="btn-secondary h-10 flex-1 text-sm">
          <Pencil size={15} />
          Edit
        </Link>
        <Link href={`/reports/${report.id}/preview`} className="btn-secondary h-10 flex-1 text-sm">
          <Eye size={15} />
          Preview
        </Link>
        {canDelete && (
          <DeleteReportButton id={report.id} reference={report.report_reference} variant="icon" />
        )}
      </div>
    </div>
  )
}
