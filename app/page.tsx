'use client'

import { useState, useEffect } from 'react'
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

interface ProjectRollup {
  id: number
  name: string
  procore_project_id: string | null
  address: string | null
  total: number
  approved: number
  pending: number
  rejected: number
  expiring: number
  expired: number
  primary: number
  second_tier: number
  health: 'good' | 'warning' | 'critical'
}

interface UpcomingExpiration {
  submission_id: number
  sub_name: string
  trade: string
  tier: string
  project_id: number | null
  project_name: string | null
  policy_type: 'gl' | 'wc' | 'auto' | 'umbrella'
  expires_on: string
  days_until: number
  status: 'expired' | 'critical' | 'warning' | 'ok'
}

interface Summary {
  totals: {
    total: number
    approved: number
    pending: number
    rejected: number
    compliance_rate: number
    orphan_submissions: number
    open_flags: number
    active_projects: number
  }
  projects: ProjectRollup[]
  upcoming_expirations: UpcomingExpiration[]
}

function formatDate(dateStr: string) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function capitalize(str: string) {
  if (!str) return '—'
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function policyLabel(type: string) {
  switch (type) {
    case 'gl': return 'General Liability'
    case 'wc': return 'Workers Comp'
    case 'auto': return 'Auto Liability'
    case 'umbrella': return 'Umbrella'
    default: return type.toUpperCase()
  }
}

// CSS-only donut ring component
function DonutRing({ value, total, color }: { value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  const r = 28
  const circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ

  return (
    <div className="relative w-20 h-20 flex items-center justify-center">
      <svg className="w-20 h-20 -rotate-90" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} fill="none" stroke="#f1f5f9" strokeWidth="8" />
        <circle
          cx="36" cy="36" r={r} fill="none"
          stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>
      <span className="absolute text-sm font-bold text-gray-800">{pct}%</span>
    </div>
  )
}

function ExpiryPill({ days, status }: { days: number; status: UpcomingExpiration['status'] }) {
  const styles: Record<UpcomingExpiration['status'], string> = {
    expired: 'bg-red-100 text-red-700 border-red-200',
    critical: 'bg-orange-100 text-orange-700 border-orange-200',
    warning: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    ok: 'bg-green-100 text-green-700 border-green-200',
  }
  const label = days < 0
    ? `Expired ${Math.abs(days)}d`
    : days === 0
      ? 'Today'
      : `in ${days}d`
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${styles[status]}`}>
      {label}
    </span>
  )
}

function HealthDot({ health }: { health: ProjectRollup['health'] }) {
  const colors = { good: 'bg-green-500', warning: 'bg-yellow-400', critical: 'bg-red-500' }
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${colors[health]}`} aria-label={health} />
}

export default function DashboardPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [projectFilter, setProjectFilter] = useState<number | 'all'>('all')

  useEffect(() => {
    Promise.all([
      fetch('/api/submissions', { cache: 'no-store' }).then((r) => r.json()).catch(() => []),
      fetch('/api/dashboard/summary', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
    ]).then(([subs, sum]) => {
      if (Array.isArray(subs)) setSubmissions(subs)
      if (sum && !sum.error) setSummary(sum)
      setLoading(false)
    })
  }, [])

  const totals = summary?.totals ?? {
    total: submissions.length,
    approved: submissions.filter((s) => s.status === 'approved').length,
    pending: submissions.filter((s) => s.status === 'pending' || s.status === 'reviewing').length,
    rejected: submissions.filter((s) => s.status === 'rejected').length,
    compliance_rate: 0,
    orphan_submissions: 0,
    open_flags: 0,
    active_projects: 0,
  }

  const filtered = submissions.filter((s) => {
    const statusMatch = filter === 'all' || s.status === filter || (filter === 'pending' && s.status === 'reviewing')
    return statusMatch
  })

  const projects = summary?.projects ?? []
  const upcoming = summary?.upcoming_expirations ?? []
  const upcomingFiltered = projectFilter === 'all'
    ? upcoming
    : upcoming.filter((u) => u.project_id === projectFilter)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white px-8 py-10">
        <div className="max-w-6xl">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold leading-tight">Insurance Compliance Dashboard</h1>
              <p className="text-slate-400 text-sm">AI-powered subcontractor insurance verification</p>
            </div>
          </div>

          {/* Quick metric strip */}
          <div className="flex flex-wrap gap-3 mt-6 text-sm">
            <div className="bg-white/10 rounded-xl px-5 py-3">
              <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Total Submissions</p>
              <p className="text-3xl font-bold mt-0.5">{totals.total}</p>
            </div>
            <div className="bg-white/10 rounded-xl px-5 py-3">
              <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Compliance Rate</p>
              <p className="text-3xl font-bold mt-0.5 text-emerald-400">{totals.compliance_rate}%</p>
            </div>
            <div className="bg-white/10 rounded-xl px-5 py-3">
              <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Active Projects</p>
              <p className="text-3xl font-bold mt-0.5 text-sky-300">{totals.active_projects}</p>
            </div>
            <div className="bg-white/10 rounded-xl px-5 py-3">
              <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Pending Review</p>
              <p className="text-3xl font-bold mt-0.5 text-yellow-400">{totals.pending}</p>
            </div>
            <div className="bg-white/10 rounded-xl px-5 py-3">
              <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">Open Flags</p>
              <p className="text-3xl font-bold mt-0.5 text-orange-400">{totals.open_flags}</p>
            </div>
            <div className="ml-auto flex items-center">
              <Link
                href="/upload"
                className="bg-white text-slate-900 px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-slate-100 transition-colors"
              >
                + New Upload
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="px-8 py-8 max-w-6xl space-y-8">
        {/* Top row: breakdown + upcoming expirations */}
        <div className="grid grid-cols-3 gap-5">
          {/* Approval breakdown */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Submission Breakdown</h2>
            <div className="flex items-center gap-6">
              <DonutRing value={totals.approved} total={totals.total} color="#22c55e" />
              <div className="flex-1 space-y-3">
                {[
                  { label: 'Approved', value: totals.approved, color: 'bg-green-500' },
                  { label: 'Pending', value: totals.pending, color: 'bg-yellow-400' },
                  { label: 'Rejected', value: totals.rejected, color: 'bg-red-500' },
                ].map(({ label, value, color }) => (
                  <div key={label}>
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>{label}</span>
                      <span className="font-semibold text-gray-900">{value}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${color} rounded-full transition-all duration-700`}
                        style={{ width: totals.total > 0 ? `${(value / totals.total) * 100}%` : '0%' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Upcoming expirations — takes 2 columns */}
          <div className="bg-white rounded-2xl border border-gray-200 col-span-2">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-700">Upcoming Expirations</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {upcomingFiltered.length} policies expiring in the next 60 days
                </p>
              </div>
              <select
                value={projectFilter === 'all' ? 'all' : String(projectFilter)}
                onChange={(e) => setProjectFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                className="text-xs border border-gray-300 rounded-lg px-2 py-1.5"
              >
                <option value="all">All Projects</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {upcomingFiltered.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-gray-500">
                  <svg className="w-10 h-10 mx-auto text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                  All caught up — no upcoming expirations.
                </div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {upcomingFiltered.map((u, i) => (
                    <li key={`${u.submission_id}-${u.policy_type}-${i}`} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-900 truncate">{u.sub_name}</p>
                          {u.tier === 'second' && (
                            <span className="text-[10px] uppercase tracking-wide bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-semibold">
                              2nd Tier
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 truncate">
                          {policyLabel(u.policy_type)} · {u.project_name ?? 'No project'} · {formatDate(u.expires_on)}
                        </p>
                      </div>
                      <ExpiryPill days={u.days_until} status={u.status} />
                      <Link
                        href={`/review/${u.submission_id}#expiration`}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium shrink-0"
                      >
                        Send Reminder →
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Projects overview */}
        <div className="bg-white rounded-2xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Insurance Status by Project</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {totals.active_projects} active projects
                {totals.orphan_submissions > 0 && ` · ${totals.orphan_submissions} submissions not linked to a project`}
              </p>
            </div>
            <Link href="/projects" className="text-xs text-slate-600 hover:text-slate-800 font-medium">
              Manage projects →
            </Link>
          </div>
          {projects.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-500 text-sm">
              No projects yet. Projects appear here once submissions are linked to a Procore project.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-6 py-3 text-left">Project</th>
                    <th className="px-6 py-3 text-left">Subs</th>
                    <th className="px-6 py-3 text-left">Approved</th>
                    <th className="px-6 py-3 text-left">Pending</th>
                    <th className="px-6 py-3 text-left">Rejected</th>
                    <th className="px-6 py-3 text-left">Expiring</th>
                    <th className="px-6 py-3 text-left">Tiers</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {projects.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <HealthDot health={p.health} />
                          <span className="font-medium text-gray-900">{p.name}</span>
                        </div>
                        {p.address && <p className="text-xs text-gray-500 ml-4.5">{p.address}</p>}
                      </td>
                      <td className="px-6 py-3 text-gray-700 font-medium">{p.total}</td>
                      <td className="px-6 py-3 text-green-700">{p.approved}</td>
                      <td className="px-6 py-3 text-yellow-700">{p.pending}</td>
                      <td className="px-6 py-3 text-red-700">{p.rejected}</td>
                      <td className="px-6 py-3">
                        {p.expired > 0 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 mr-1">
                            {p.expired} expired
                          </span>
                        )}
                        {p.expiring > 0 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                            {p.expiring} soon
                          </span>
                        )}
                        {p.expired === 0 && p.expiring === 0 && (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-xs text-gray-600">
                        {p.primary} primary · {p.second_tier} 2nd
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Submissions Table */}
        <div className="bg-white rounded-2xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Submissions</h2>
            {/* Status filter tabs */}
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1 text-xs">
              {[
                { key: 'all', label: 'All' },
                { key: 'pending', label: 'Pending' },
                { key: 'approved', label: 'Approved' },
                { key: 'rejected', label: 'Rejected' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`px-3 py-1.5 rounded-md font-medium transition-colors ${filter === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="px-6 py-12 text-center text-gray-400 text-sm">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-500">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
                </svg>
              </div>
              <p className="font-medium">No submissions yet</p>
              <p className="text-sm mt-1">
                <Link href="/upload" className="text-blue-600 hover:underline">Upload your first document</Link> to get started.
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
                  {filtered.map((sub) => (
                    <tr key={sub.id} className="hover:bg-gray-50 transition-colors group">
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
                          className="text-blue-600 hover:text-blue-800 font-medium group-hover:underline"
                        >
                          Review →
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
    </div>
  )
}
