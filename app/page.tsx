import Link from 'next/link'
import StatusBadge from '@/components/StatusBadge'

interface Submission {
  id: number
  sub_name: string
  trade: string
  tier: string
  status: string
  uploaded_at: string
}

interface Stats {
  total: number
  pending: number
  approved: number
  rejected: number
}

async function getStats(): Promise<Stats> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/submissions`, {
      cache: 'no-store',
    })
    if (!res.ok) return { total: 0, pending: 0, approved: 0, rejected: 0 }
    const data: Submission[] = await res.json()
    return {
      total: data.length,
      pending: data.filter((s) => s.status === 'pending' || s.status === 'reviewing').length,
      approved: data.filter((s) => s.status === 'approved').length,
      rejected: data.filter((s) => s.status === 'rejected').length,
    }
  } catch {
    return { total: 0, pending: 0, approved: 0, rejected: 0 }
  }
}

async function getSubmissions(): Promise<Submission[]> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/submissions`, {
      cache: 'no-store',
    })
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

function formatDate(dateStr: string) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function capitalize(str: string) {
  if (!str) return '—'
  return str.charAt(0).toUpperCase() + str.slice(1)
}

export default async function DashboardPage() {
  const [stats, submissions] = await Promise.all([getStats(), getSubmissions()])

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Overview of subcontractor insurance submissions</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-5 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500 font-medium">Total Subcontractors</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-yellow-600 font-medium">Pending Review</p>
          <p className="text-3xl font-bold text-yellow-600 mt-1">{stats.pending}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-green-600 font-medium">Approved</p>
          <p className="text-3xl font-bold text-green-600 mt-1">{stats.approved}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-red-600 font-medium">Rejected</p>
          <p className="text-3xl font-bold text-red-600 mt-1">{stats.rejected}</p>
        </div>
      </div>

      {/* Submissions Table */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Recent Submissions</h2>
          <Link
            href="/upload"
            className="text-sm bg-[#0f172a] text-white px-4 py-2 rounded-lg hover:bg-slate-700 transition-colors"
          >
            + New Upload
          </Link>
        </div>

        {submissions.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500">
            <p className="text-lg mb-2">No submissions yet</p>
            <p className="text-sm">
              <Link href="/upload" className="text-blue-600 hover:underline">
                Upload your first document
              </Link>{' '}
              to get started.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Subcontractor</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Trade</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Tier</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Uploaded</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {submissions.map((sub) => (
                  <tr key={sub.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900">{sub.sub_name}</td>
                    <td className="px-6 py-4 text-gray-600">{sub.trade || '—'}</td>
                    <td className="px-6 py-4 text-gray-600">{capitalize(sub.tier)}</td>
                    <td className="px-6 py-4">
                      <StatusBadge status={sub.status} />
                    </td>
                    <td className="px-6 py-4 text-gray-500">{formatDate(sub.uploaded_at)}</td>
                    <td className="px-6 py-4">
                      <Link
                        href={`/review/${sub.id}`}
                        className="text-blue-600 hover:text-blue-800 font-medium"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
