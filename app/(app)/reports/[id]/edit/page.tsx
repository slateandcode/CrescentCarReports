import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { requireUser } from '@/lib/auth'
import { getReportById } from '@/lib/data'
import { ReportEditor } from '@/components/reports/ReportEditor'

export const metadata = { title: 'Edit report' }
export const dynamic = 'force-dynamic'

export default async function EditReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { profile } = await requireUser()
  const report = await getReportById(id)
  if (!report) notFound()

  return (
    <div>
      <Link
        href="/reports"
        className="no-print mb-1 inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft size={16} /> Reports
      </Link>
      <ReportEditor
        report={report}
        inspectorName={profile.full_name}
        canDelete={profile.role === 'admin'}
      />
    </div>
  )
}
