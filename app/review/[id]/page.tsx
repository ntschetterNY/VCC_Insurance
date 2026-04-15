'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import StatusBadge from '@/components/StatusBadge'
import Link from 'next/link'

interface SubmissionDetail {
  id: number
  status: string
  uploaded_at: string
  reviewed_at: string | null
  reviewer_notes: string | null
  sub_name: string
  trade: string
  tier: string
  assigned_to: number | null
  assigned_user_name: string | null
  procore_project_id: string | null
  procore_contract_id: string | null
  documents: {
    id: number
    doc_type: string
    filename: string
    processed_at: string | null
  }[]
  ai_analysis: {
    cg_numbers: string[]
    limits_found: Record<string, number | null>
    limits_met: boolean
    issues: string[]
    flags: string[]
    checklist: Record<string, string | null>
    custom_checks?: Record<string, string | null>
    created_at: string
  } | null
  reviewer_flags: {
    id: number
    flag_type: string
    description: string
    severity: string
    created_at: string
  }[]
  schedule: {
    trade: string
    schedule_type: string | null
    deductible: number | null
    schedule_group: string
    gl_per_occurrence: number
    gl_aggregate: number
    workers_comp: number
    auto_liability: number
    umbrella: number
  } | null
  available_reviewers: { id: number; name: string; role: string }[]
}

const LIMIT_LABELS: Record<string, string> = {
  gl_per_occurrence: 'GL Per Occurrence',
  gl_aggregate: 'GL Aggregate',
  workers_comp: 'Workers Compensation',
  auto_liability: 'Auto Liability',
  umbrella: 'Umbrella / Excess',
}

function formatCurrency(val: number | null | undefined) {
  if (val == null) return '—'
  return '$' + val.toLocaleString()
}

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const severityColors: Record<string, string> = {
  low: 'bg-blue-100 text-blue-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-red-100 text-red-800',
}

// COI document categories the user must provide
const COI_CATEGORIES: { value: string; label: string; color: string }[] = [
  { value: 'accord25', label: 'Accord 25', color: 'bg-blue-100 text-blue-800' },
  { value: 'policy_gl', label: 'GL Policy', color: 'bg-emerald-100 text-emerald-800' },
  { value: 'policy_excess', label: 'UM Policy', color: 'bg-purple-100 text-purple-800' },
  { value: 'policy_wc', label: 'WC Policy', color: 'bg-amber-100 text-amber-800' },
  { value: 'policy_auto', label: 'Auto Policy', color: 'bg-cyan-100 text-cyan-800' },
  { value: 'endorsement', label: 'Endorsements', color: 'bg-rose-100 text-rose-800' },
]

const ALL_DOC_TYPES: { value: string; label: string }[] = [
  { value: 'accord25', label: 'Accord 25' },
  { value: 'policy_gl', label: 'GL Policy' },
  { value: 'policy_excess', label: 'UM Policy' },
  { value: 'policy_wc', label: 'WC Policy' },
  { value: 'policy_auto', label: 'Auto Policy' },
  { value: 'endorsement', label: 'Endorsements' },
  { value: 'accord28', label: 'Accord 28' },
  { value: 'contract', label: 'Contract' },
  { value: 'other', label: 'Other' },
]

function docTypeLabel(docType: string): string {
  const match = ALL_DOC_TYPES.find((t) => t.value === docType)
  return match?.label ?? docType
}

function docTypeBadgeColor(docType: string): string {
  const cat = COI_CATEGORIES.find((c) => c.value === docType)
  return cat?.color ?? 'bg-gray-100 text-gray-700'
}

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [data, setData] = useState<SubmissionDetail | null>(null)
  const [currentUser, setCurrentUser] = useState<{ id: number; role: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [reviewerNotes, setReviewerNotes] = useState('')
  const [reanalyzing, setReanalyzing] = useState(false)
  const [assignedTo, setAssignedTo] = useState<number | ''>('')
  const [deleting, setDeleting] = useState(false)

  // Flag form
  const [flagType, setFlagType] = useState('')
  const [flagDesc, setFlagDesc] = useState('')
  const [flagSeverity, setFlagSeverity] = useState('medium')
  const [flagSubmitting, setFlagSubmitting] = useState(false)

  // Document upload
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadDragOver, setUploadDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const loadData = useCallback(async () => {
    try {
      const [subRes, meRes] = await Promise.all([
        fetch(`/api/submissions/${id}`),
        fetch('/api/auth/me'),
      ])
      if (!subRes.ok) throw new Error('Failed to load')
      const d: SubmissionDetail = await subRes.json()
      setData(d)
      setReviewerNotes(d.reviewer_notes || '')
      setAssignedTo(d.assigned_to ?? '')
      if (meRes.ok) setCurrentUser(await meRes.json())
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    loadData()
  }, [loadData])

  async function updateStatus(status: string) {
    setActionLoading(true)
    try {
      await fetch(`/api/submissions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, reviewer_notes: reviewerNotes }),
      })
      await loadData()
    } finally {
      setActionLoading(false)
    }
  }

  async function saveNotes() {
    setActionLoading(true)
    try {
      await fetch(`/api/submissions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewer_notes: reviewerNotes }),
      })
      await loadData()
    } finally {
      setActionLoading(false)
    }
  }

  async function saveAssignment() {
    await fetch(`/api/submissions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigned_to: assignedTo === '' ? null : assignedTo }),
    })
    await loadData()
  }

  async function reanalyze() {
    setReanalyzing(true)
    try {
      await fetch(`/api/analysis/${id}`, { method: 'POST' })
      await loadData()
    } finally {
      setReanalyzing(false)
    }
  }

  async function addFlag(e: React.FormEvent) {
    e.preventDefault()
    if (!flagType.trim() || !flagDesc.trim()) return
    setFlagSubmitting(true)
    try {
      await fetch('/api/flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submission_id: parseInt(id),
          flag_type: flagType,
          description: flagDesc,
          severity: flagSeverity,
        }),
      })
      setFlagType('')
      setFlagDesc('')
      setFlagSeverity('medium')
      await loadData()
    } finally {
      setFlagSubmitting(false)
    }
  }

  async function updateDocType(docId: number, newType: string) {
    try {
      await fetch(`/api/documents/${docId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc_type: newType }),
      })
      await loadData()
    } catch {
      // ignore
    }
  }

  async function deleteSubmission() {
    if (!confirm('Permanently delete this submission and all associated documents? This cannot be undone.')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/submissions/${id}`, { method: 'DELETE' })
      if (res.ok) {
        router.push('/')
      } else {
        const body = await res.json().catch(() => ({}))
        alert(body.error || 'Delete failed')
      }
    } finally {
      setDeleting(false)
    }
  }

  // --- Document upload handlers ---
  const handleUploadFiles = useCallback(async (files: FileList | File[]) => {
    const pdfFiles = Array.from(files).filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    )
    if (pdfFiles.length === 0) {
      setUploadError('Please upload PDF files only.')
      return
    }
    setUploadError('')
    setUploading(true)
    try {
      const fd = new FormData()
      for (const f of pdfFiles) {
        fd.append('files', f)
      }
      const res = await fetch(`/api/submissions/${id}/documents`, {
        method: 'POST',
        body: fd,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Upload failed')
      }
      await loadData()
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }, [id, loadData])

  const handleUploadDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setUploadDragOver(true)
  }, [])
  const handleUploadDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setUploadDragOver(false)
  }, [])
  const handleUploadDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setUploadDragOver(false)
    if (e.dataTransfer.files.length > 0) handleUploadFiles(e.dataTransfer.files)
  }, [handleUploadFiles])
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleUploadFiles(e.target.files)
      e.target.value = ''
    }
  }, [handleUploadFiles])

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-64">
        <p className="text-gray-500">Loading submission…</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="p-8">
        <p className="text-red-600">Submission not found.</p>
        <Link href="/" className="text-blue-600 hover:underline text-sm mt-2 inline-block">← Back to Dashboard</Link>
      </div>
    )
  }

  const analysis = data.ai_analysis
  const schedule = data.schedule
  const isAdmin = currentUser?.role === 'admin'

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <Link href="/" className="text-sm text-gray-400 hover:text-gray-600 mb-2 inline-block">← Dashboard</Link>
          <h1 className="text-2xl font-bold text-gray-900">{data.sub_name}</h1>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <StatusBadge status={data.status} />
            <span className="text-sm text-gray-500">{data.trade || 'No trade'}</span>
            <span className="text-sm text-gray-400">·</span>
            <span className="text-sm text-gray-500 capitalize">{data.tier} tier</span>
            <span className="text-sm text-gray-400">·</span>
            <span className="text-sm text-gray-500">Uploaded {formatDate(data.uploaded_at)}</span>
            {data.procore_project_id && (
              <>
                <span className="text-sm text-gray-400">·</span>
                <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded font-medium">
                  Procore #{data.procore_project_id}
                  {data.procore_contract_id ? ` / ${data.procore_contract_id}` : ''}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <button
            onClick={() => updateStatus('approved')}
            disabled={actionLoading || data.status === 'approved'}
            className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            Approve
          </button>
          <button
            onClick={() => updateStatus('rejected')}
            disabled={actionLoading || data.status === 'rejected'}
            className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            Reject
          </button>
          <button
            onClick={() => updateStatus('reviewing')}
            disabled={actionLoading || data.status === 'reviewing'}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            Mark Reviewing
          </button>
          {isAdmin && (
            <button
              onClick={deleteSubmission}
              disabled={deleting}
              className="bg-gray-100 text-red-600 border border-red-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">

          {/* AI Analysis */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">AI Analysis</h2>
              <button
                onClick={reanalyze}
                disabled={reanalyzing}
                className="text-xs text-slate-600 border border-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                {reanalyzing ? 'Re-analyzing…' : 'Re-run Analysis'}
              </button>
            </div>

            {!analysis ? (
              <div className="px-6 py-8 text-center text-gray-500">
                <p className="mb-3">No AI analysis available yet.</p>
                <button
                  onClick={reanalyze}
                  disabled={reanalyzing}
                  className="bg-[#0f172a] text-white px-4 py-2 rounded-lg text-sm hover:bg-slate-700 disabled:opacity-50"
                >
                  {reanalyzing ? 'Analyzing…' : 'Run Analysis'}
                </button>
              </div>
            ) : (
              <div className="p-6 space-y-6">
                {/* Overall result */}
                <div className={`rounded-lg px-4 py-3 text-sm font-medium ${analysis.limits_met ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                  {analysis.limits_met ? '✓ All required limits are met' : '✗ One or more required limits are not met or missing'}
                </div>

                {/* CG Numbers */}
                {analysis.cg_numbers && analysis.cg_numbers.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">CG Policy Numbers</h3>
                    <div className="flex flex-wrap gap-2">
                      {analysis.cg_numbers.map((cg, i) => (
                        <span key={i} className="bg-slate-100 text-slate-800 px-2.5 py-1 rounded text-xs font-mono">
                          {cg}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Schedule & Limits Comparison */}
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-sm font-semibold text-gray-700">Coverage Limits</h3>
                    {schedule?.schedule_type && (
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                        schedule.schedule_type === 'A' ? 'bg-green-100 text-green-800' :
                        schedule.schedule_type === 'B' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        Schedule {schedule.schedule_type}
                      </span>
                    )}
                    {schedule?.deductible != null && schedule.deductible > 0 && (
                      <span className="text-xs text-gray-500">Deductible: {formatCurrency(schedule.deductible)}</span>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Coverage</th>
                          <th className="text-right py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Required</th>
                          <th className="text-right py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Found</th>
                          <th className="text-center py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {Object.entries(LIMIT_LABELS).map(([key, label]) => {
                          const found = analysis.limits_found?.[key]
                          const required = schedule?.[key as keyof typeof schedule] as number | undefined
                          const met = found != null && required != null ? found >= required : found != null && required == null
                          const missing = required != null && found == null
                          return (
                            <tr key={key}>
                              <td className="py-2 pr-4 text-gray-700">{label}</td>
                              <td className="py-2 pr-4 text-right text-gray-500">{formatCurrency(required ?? null)}</td>
                              <td className="py-2 pr-4 text-right font-medium text-gray-900">{formatCurrency(found ?? null)}</td>
                              <td className="py-2 text-center">
                                {required == null && found == null ? (
                                  <span className="text-gray-400 text-xs">N/A</span>
                                ) : missing ? (
                                  <span className="text-red-600 text-xs font-medium">Missing</span>
                                ) : met ? (
                                  <span className="text-green-600 text-xs font-medium">✓ Pass</span>
                                ) : (
                                  <span className="text-red-600 text-xs font-medium">✗ Low</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Issues */}
                {analysis.issues && analysis.issues.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Issues Found</h3>
                    <ul className="space-y-1.5">
                      {analysis.issues.map((issue, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">
                          <span className="mt-0.5 shrink-0">✗</span>
                          {issue}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Flags */}
                {analysis.flags && analysis.flags.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Flags &amp; Concerns</h3>
                    <ul className="space-y-1.5">
                      {analysis.flags.map((flag, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-yellow-800 bg-yellow-50 rounded-lg px-3 py-2">
                          <span className="mt-0.5 shrink-0">⚑</span>
                          {flag}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Insurance Review Checklist */}
                {analysis.checklist && Object.keys(analysis.checklist).length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Insurance Review Checklist</h3>
                    <div className="space-y-4">
                      {/* Contract Review */}
                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="bg-slate-50 px-4 py-2 border-b border-gray-200">
                          <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Contract</h4>
                        </div>
                        <div className="divide-y divide-gray-100">
                          {([
                            ['contract_signed', 'Contract Signed'],
                            ['contracted_with', 'Contracted With'],
                            ['indemnification', 'Indemnification'],
                            ['ai_premise', 'AI Premise (Additional Insured)'],
                            ['ai_comp_ops', 'AI Completed Ops'],
                          ] as const).map(([key, label]) => {
                            const val = analysis.checklist?.[key]
                            return (
                              <div key={key} className="flex justify-between px-4 py-2 text-sm">
                                <span className="text-gray-600">{label}</span>
                                <span className={`font-medium ${val === 'Y' || val === 'Yes' ? 'text-green-700' : val === 'N' || val === 'No' ? 'text-red-700' : 'text-gray-800'}`}>
                                  {val || '—'}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {/* General Liability */}
                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="bg-slate-50 px-4 py-2 border-b border-gray-200">
                          <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">General Liability</h4>
                        </div>
                        <div className="divide-y divide-gray-100">
                          {([
                            ['gl_carrier', 'Carrier'],
                            ['gl_carrier_rating', 'Carrier Rating'],
                            ['gl_limits', 'Limits'],
                            ['gl_term', 'Term'],
                            ['gl_full_policy', 'Full Policy'],
                            ['cg_20_10', 'CG 20 10'],
                            ['cg_20_37', 'CG 20 37'],
                            ['pnc', 'Primary & Non-Contributory'],
                            ['wos', 'Waiver of Subrogation'],
                            ['occ_claims_made', 'Occurrence / Claims Made'],
                            ['per_project_limits', 'Per Project Limits'],
                            ['defense_in_out', 'Defense In/Out'],
                            ['action_over_excl', 'Action Over Exclusion'],
                            ['subsidence_excl', 'Subsidence Exclusion'],
                            ['deductible', 'Deductible'],
                            ['contractual_liability', 'Contractual Liability'],
                            ['gl_compliant', 'Compliant'],
                            ['gl_comments', 'Comments'],
                          ] as const).map(([key, label]) => {
                            const val = analysis.checklist?.[key]
                            if (!val) return null
                            const isCompliance = key === 'gl_compliant'
                            return (
                              <div key={key} className="flex justify-between px-4 py-2 text-sm gap-4">
                                <span className="text-gray-600 shrink-0">{label}</span>
                                <span className={`font-medium text-right ${isCompliance ? (val === 'Y' || val === 'Yes' ? 'text-green-700' : 'text-red-700') : 'text-gray-800'}`}>
                                  {val}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {/* Excess / Umbrella */}
                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="bg-slate-50 px-4 py-2 border-b border-gray-200">
                          <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Excess / Umbrella</h4>
                        </div>
                        <div className="divide-y divide-gray-100">
                          {([
                            ['excess_carrier', 'Carrier'],
                            ['excess_limits', 'Limits'],
                            ['excess_term', 'Term'],
                            ['excess_full_policy', 'Full Policy'],
                            ['excess_type', 'Excess / Umbrella'],
                            ['excess_compliant', 'Compliant'],
                            ['excess_comments', 'Comments'],
                          ] as const).map(([key, label]) => {
                            const val = analysis.checklist?.[key]
                            if (!val) return null
                            const isCompliance = key === 'excess_compliant'
                            return (
                              <div key={key} className="flex justify-between px-4 py-2 text-sm gap-4">
                                <span className="text-gray-600 shrink-0">{label}</span>
                                <span className={`font-medium text-right ${isCompliance ? (val === 'Y' || val === 'Yes' ? 'text-green-700' : 'text-red-700') : 'text-gray-800'}`}>
                                  {val}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {/* Commercial Auto */}
                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="bg-slate-50 px-4 py-2 border-b border-gray-200">
                          <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Commercial Auto</h4>
                        </div>
                        <div className="divide-y divide-gray-100">
                          {([
                            ['auto_carrier', 'Carrier'],
                            ['auto_limits', 'Limits'],
                            ['auto_term', 'Term'],
                            ['auto_full_policy', 'Full Policy'],
                            ['auto_comments', 'Comments'],
                          ] as const).map(([key, label]) => {
                            const val = analysis.checklist?.[key]
                            if (!val) return null
                            return (
                              <div key={key} className="flex justify-between px-4 py-2 text-sm gap-4">
                                <span className="text-gray-600 shrink-0">{label}</span>
                                <span className="font-medium text-right text-gray-800">{val}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {/* Workers Compensation */}
                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="bg-slate-50 px-4 py-2 border-b border-gray-200">
                          <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Workers Compensation</h4>
                        </div>
                        <div className="divide-y divide-gray-100">
                          {([
                            ['wc_carrier', 'Carrier'],
                            ['wc_limits', 'Limits'],
                            ['wc_term', 'Term'],
                            ['wc_full_policy', 'Full Policy'],
                            ['wc_comments', 'Comments'],
                          ] as const).map(([key, label]) => {
                            const val = analysis.checklist?.[key]
                            if (!val) return null
                            return (
                              <div key={key} className="flex justify-between px-4 py-2 text-sm gap-4">
                                <span className="text-gray-600 shrink-0">{label}</span>
                                <span className="font-medium text-right text-gray-800">{val}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {/* Custom Review Checks */}
                      {analysis.custom_checks && Object.keys(analysis.custom_checks).length > 0 && (
                        <div className="border border-emerald-200 rounded-lg overflow-hidden">
                          <div className="bg-emerald-50 px-4 py-2 border-b border-emerald-200">
                            <h4 className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Custom Review Checks</h4>
                          </div>
                          <div className="divide-y divide-gray-100">
                            {Object.entries(analysis.custom_checks).map(([checkName, result]) => {
                              if (!result) return null
                              const isPass = /^(y|yes|found|present|included|compliant)/i.test(result)
                              const isFail = /^(n|no|not found|missing|absent|excluded|non-compliant)/i.test(result)
                              return (
                                <div key={checkName} className="flex justify-between px-4 py-2 text-sm gap-4">
                                  <span className="text-gray-600 shrink-0">{checkName}</span>
                                  <span className={`font-medium text-right ${isFail ? 'text-red-700' : isPass ? 'text-green-700' : 'text-gray-800'}`}>
                                    {result}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <p className="text-xs text-gray-400">Analysis generated {formatDate(analysis.created_at)}</p>
              </div>
            )}
          </div>

          {/* Reviewer Flags */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-base font-semibold text-gray-900">Reviewer Flags</h2>
            </div>
            <div className="p-6 space-y-4">
              {data.reviewer_flags.length > 0 && (
                <div className="space-y-2 mb-4">
                  {data.reviewer_flags.map((f) => (
                    <div key={f.id} className="border border-gray-200 rounded-lg px-4 py-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-900">{f.flag_type}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${severityColors[f.severity] ?? 'bg-gray-100 text-gray-700'}`}>
                          {f.severity}
                        </span>
                        <span className="text-xs text-gray-400 ml-auto">{formatDate(f.created_at)}</span>
                      </div>
                      <p className="text-sm text-gray-600">{f.description}</p>
                    </div>
                  ))}
                </div>
              )}

              <form onSubmit={addFlag} className="border border-dashed border-gray-300 rounded-lg p-4 space-y-3">
                <p className="text-sm font-medium text-gray-700">Add Flag</p>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Flag type (e.g. Missing Endorsement)"
                    value={flagType}
                    onChange={(e) => setFlagType(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                  />
                  <select
                    value={flagSeverity}
                    onChange={(e) => setFlagSeverity(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <textarea
                  placeholder="Description…"
                  value={flagDesc}
                  onChange={(e) => setFlagDesc(e.target.value)}
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 resize-none"
                />
                <button
                  type="submit"
                  disabled={flagSubmitting}
                  className="bg-[#0f172a] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-50"
                >
                  {flagSubmitting ? 'Adding…' : 'Add Flag'}
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          {/* Documents — COI Categories */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Documents</h3>

            {/* Required COI category checklist */}
            <div className="mb-4 space-y-1">
              {COI_CATEGORIES.map((cat) => {
                const docs = data.documents.filter((d) => d.doc_type === cat.value)
                const present = docs.length > 0
                return (
                  <div key={cat.value} className="flex items-center gap-2 text-xs">
                    <span className={`w-4 h-4 flex items-center justify-center rounded-full ${present ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                      {present ? '\u2713' : '\u2717'}
                    </span>
                    <span className={`font-medium ${present ? 'text-gray-700' : 'text-red-600'}`}>
                      {cat.label}
                    </span>
                    {present && (
                      <span className="text-gray-400">({docs.length})</span>
                    )}
                  </div>
                )
              })}
            </div>

            <hr className="border-gray-100 mb-3" />

            {data.documents.length === 0 ? (
              <p className="text-sm text-gray-400">No documents uploaded</p>
            ) : (
              <ul className="space-y-3">
                {data.documents.map((doc) => (
                  <li key={doc.id} className="border border-gray-100 rounded-lg p-3">
                    <p className="font-medium text-gray-800 text-sm truncate mb-1.5" title={doc.filename}>{doc.filename}</p>
                    <div className="flex items-center gap-2 mb-2">
                      <select
                        value={doc.doc_type}
                        onChange={(e) => updateDocType(doc.id, e.target.value)}
                        className="border border-gray-200 rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400 bg-white"
                      >
                        {ALL_DOC_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${docTypeBadgeColor(doc.doc_type)}`}>
                        {docTypeLabel(doc.doc_type)}
                      </span>
                    </div>
                    <a
                      href={`/api/documents/${doc.id}/download`}
                      download
                      className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium border border-blue-200 hover:border-blue-400 px-2.5 py-1 rounded-lg transition-colors"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download
                    </a>
                  </li>
                ))}
              </ul>
            )}

            {/* Upload drop zone */}
            <div className="mt-4">
              <div
                onDragOver={handleUploadDragOver}
                onDragLeave={handleUploadDragLeave}
                onDrop={handleUploadDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                  uploadDragOver
                    ? 'border-slate-500 bg-slate-50'
                    : 'border-gray-300 hover:border-gray-400 bg-gray-50/50'
                } ${uploading ? 'pointer-events-none opacity-60' : ''}`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  multiple
                  onChange={handleFileInputChange}
                  className="hidden"
                />
                {uploading ? (
                  <div className="flex flex-col items-center gap-1.5">
                    <svg className="w-6 h-6 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <p className="text-xs text-gray-500">Uploading & classifying...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1.5">
                    <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-xs font-medium text-gray-600">
                      Drop PDFs here or click to browse
                    </p>
                    <p className="text-xs text-gray-400">
                      Add more documents to this submission
                    </p>
                  </div>
                )}
              </div>
              {uploadError && (
                <p className="text-xs text-red-600 mt-2">{uploadError}</p>
              )}
            </div>
          </div>

          {/* Assign Reviewer */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Assigned Reviewer</h3>
            {data.assigned_user_name && (
              <p className="text-sm text-gray-600 mb-2">
                Currently: <span className="font-medium text-gray-900">{data.assigned_user_name}</span>
              </p>
            )}
            <select
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value === '' ? '' : parseInt(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 mb-2"
            >
              <option value="">— Unassigned —</option>
              {data.available_reviewers.map((r) => (
                <option key={r.id} value={r.id}>{r.name} ({r.role})</option>
              ))}
            </select>
            <button
              onClick={saveAssignment}
              className="w-full bg-slate-100 text-slate-800 px-3 py-2 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors"
            >
              Save Assignment
            </button>
          </div>

          {/* Schedule Requirements */}
          {schedule && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900">Schedule: {schedule.trade}</h3>
                {schedule.schedule_group && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                    schedule.schedule_group === 'A' ? 'bg-blue-100 text-blue-800' :
                    schedule.schedule_group === 'B' ? 'bg-purple-100 text-purple-800' :
                    schedule.schedule_group === 'C' ? 'bg-amber-100 text-amber-800' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    Group {schedule.schedule_group}
                  </span>
                )}
              </div>
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">GL / Occurrence</dt>
                  <dd className="font-medium">{formatCurrency(schedule.gl_per_occurrence)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">GL Aggregate</dt>
                  <dd className="font-medium">{formatCurrency(schedule.gl_aggregate)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Workers Comp</dt>
                  <dd className="font-medium">{formatCurrency(schedule.workers_comp)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Auto Liability</dt>
                  <dd className="font-medium">{formatCurrency(schedule.auto_liability)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Umbrella</dt>
                  <dd className="font-medium">{formatCurrency(schedule.umbrella)}</dd>
                </div>
              </dl>
            </div>
          )}

          {/* Reviewer Notes */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Reviewer Notes</h3>
            <textarea
              value={reviewerNotes}
              onChange={(e) => setReviewerNotes(e.target.value)}
              rows={4}
              placeholder="Add notes…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 resize-none"
            />
            <button
              onClick={saveNotes}
              disabled={actionLoading}
              className="mt-2 w-full bg-slate-100 text-slate-800 px-3 py-2 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors disabled:opacity-50"
            >
              Save Notes
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
