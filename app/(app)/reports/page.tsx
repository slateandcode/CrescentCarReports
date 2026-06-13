import Link from 'next/link'
import { Plus, FileSearch } from 'lucide-react'
import { requireUser } from '@/lib/auth'
import { getReports, type ReportFilters as Filters } from '@/lib/data'
import { ReportFilters } from '@/components/reports/ReportFilters'
import { ReportCard } from '@/components/reports/ReportCard'

export const metadata = { title: 'Reports' }
export const dynamic = 'force-dynamic'

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const { profile } = await requireUser()
  const canDelete = profile.role === 'admin'
  const sp = await searchParams
  const filters: Filters = {
    search: sp.search,
    status: (sp.status as Filters['status']) ?? 'all',
    pkg: (sp.pkg as Filters['pkg']) ?? 'all',
    sort: (sp.sort as Filters['sort']) ?? 'updated',
  }
  const reports = await getReports(filters)
  const hasQuery = Boolean(sp.search || (sp.status && sp.status !== 'all') || (sp.pkg && sp.pkg !== 'all'))

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-display-sm text-text-primary">Reports</h1>
        <Link href="/reports/new" className="btn-primary">
          <Plus size={18} />
          <span className="hidden sm:inline">New Report</span>
        </Link>
      </div>

      <ReportFilters />

      <p className="text-sm text-text-muted">
        {reports.length} {reports.length === 1 ? 'report' : 'reports'}
      </p>

      {reports.length === 0 ? (
        <div className="card-base flex flex-col items-center justify-center px-6 py-16 text-center">
          <FileSearch size={28} className="text-text-muted" />
          <h3 className="mt-3 text-lg font-semibold text-text-primary">
            {hasQuery ? 'No matching reports' : 'No reports yet'}
          </h3>
          <p className="mt-1 max-w-xs text-sm text-text-secondary">
            {hasQuery
              ? 'Try a different search or clear the filters.'
              : 'Create your first inspection report to get started.'}
          </p>
          {!hasQuery && (
            <Link href="/reports/new" className="btn-primary mt-5">
              <Plus size={18} />
              New Report
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {reports.map((r) => (
            <ReportCard key={r.id} report={r} canDelete={canDelete} />
          ))}
        </div>
      )}
    </div>
  )
}
