'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  classifyTrade,
  getTradeOptions,
} from '@/lib/scheduleClassification'

interface Subcontractor {
  id: number
  name: string
  trade: string
  tier: string
}

interface ScheduleEntry {
  id: number
  trade: string
  schedule_group: string
  gl_per_occurrence: number
  gl_aggregate: number
  workers_comp: number
  auto_liability: number
  umbrella: number
  notes: string
}

interface ProcoreProject {
  id: number | string
  name: string
}

interface ProcoreContract {
  id: number | string
  title: string
  number: string
  vendor: string
}

const DOC_TYPE_OPTIONS = [
  { value: '', label: 'Auto-detect' },
  { value: 'accord25', label: 'Accord 25' },
  { value: 'policy_gl', label: 'GL Policy' },
  { value: 'policy_excess', label: 'UM Policy' },
  { value: 'policy_wc', label: 'WC Policy' },
  { value: 'policy_auto', label: 'Auto Policy' },
  { value: 'endorsement', label: 'Endorsements' },
  { value: 'other', label: 'Other' },
]

interface QueuedFile {
  id: string
  file: File
  docType: string
}

function formatCurrency(v: number) {
  if (!v) return '—'
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`
  return `$${v}`
}

export default function UploadPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([])
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([])
  const [useExisting, setUseExisting] = useState(false)
  const [existingSubId, setExistingSubId] = useState('')
  const [name, setName] = useState('')
  const [trade, setTrade] = useState('')
  const [tier, setTier] = useState('primary')
  const [files, setFiles] = useState<QueuedFile[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [progress, setProgress] = useState<{ current: number; total: number; label: string } | null>(null)

  // Procore
  const [procoreConfigured, setProcoreConfigured] = useState(false)
  const [procoreProjects, setProcoreProjects] = useState<ProcoreProject[]>([])
  const [procoreProjectId, setProcoreProjectId] = useState('')
  const [procoreContracts, setProcoreContracts] = useState<ProcoreContract[]>([])
  const [procoreContractId, setProcoreContractId] = useState('')
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [loadingContracts, setLoadingContracts] = useState(false)
  const [procoreError, setProcoreError] = useState('')

  // Trade options from Attachment 1 schedule chart
  const tradeOptions = useMemo(() => getTradeOptions(), [])

  // Determine schedule classification whenever trade changes
  const scheduleMatch = useMemo(() => classifyTrade(trade), [trade])

  useEffect(() => {
    fetch('/api/subcontractors').then((r) => r.json()).then(setSubcontractors).catch(() => {})
    fetch('/api/schedule').then((r) => r.json()).then((d) => { if (Array.isArray(d)) setSchedules(d) }).catch(() => {})
    fetch('/api/procore').then((r) => r.json()).then((d) => {
      if (d.configured) {
        setProcoreConfigured(true)
        setLoadingProjects(true)
        fetch('/api/procore/projects')
          .then((r) => r.json())
          .then((projects) => { if (Array.isArray(projects)) setProcoreProjects(projects) })
          .catch(() => {})
          .finally(() => setLoadingProjects(false))
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!procoreProjectId) {
      setProcoreContracts([])
      setProcoreContractId('')
      setProcoreError('')
      return
    }
    setLoadingContracts(true)
    setProcoreContractId('')
    setProcoreError('')
    fetch(`/api/procore/projects/${procoreProjectId}/contracts`)
      .then(async (r) => {
        const data = await r.json()
        if (!r.ok) {
          setProcoreError(data.error || `Failed to load commitments (${r.status})`)
          setProcoreContracts([])
          return
        }
        if (Array.isArray(data)) {
          setProcoreContracts(data)
          if (data.length === 0) {
            setProcoreError('No commitments found for this project')
          }
        } else {
          console.error('Unexpected commitments response:', data)
          setProcoreError('Unexpected response format from Procore')
          setProcoreContracts([])
        }
      })
      .catch((err) => {
        console.error('Failed to fetch commitments:', err)
        setProcoreError('Network error loading commitments')
      })
      .finally(() => setLoadingContracts(false))
  }, [procoreProjectId])

  // Auto-populate Sub Name & Trade when a commitment is selected
  const handleCommitmentChange = useCallback(
    (contractId: string) => {
      setProcoreContractId(contractId)
      if (!contractId) return
      const contract = procoreContracts.find(
        (c) => String(c.id) === contractId
      )
      if (!contract) return
      // Fill in Sub Name from vendor, Trade from title (unless using existing sub)
      if (!useExisting) {
        if (contract.vendor) setName(contract.vendor)
        if (contract.title) setTrade(contract.title)
      }
    },
    [procoreContracts, useExisting]
  )

  // -------------------------------------------------------------------------
  // Add files (from drop or picker)
  // -------------------------------------------------------------------------
  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const pdfFiles = Array.from(newFiles).filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    )
    if (pdfFiles.length === 0) {
      setError('Please upload PDF files only.')
      return
    }
    setError('')
    const entries: QueuedFile[] = pdfFiles.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      docType: '',
    }))
    setFiles((prev) => [...prev, ...entries])
  }, [])

  // Drag & drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(true)
  }, [])
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(false)
  }, [])
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(false)
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files)
  }, [addFiles])
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files)
      e.target.value = ''
    }
  }, [addFiles])

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }, [])

  const updateFileType = useCallback((id: string, docType: string) => {
    setFiles((prev) => prev.map((f) => f.id === id ? { ...f, docType } : f))
  }, [])

  // -------------------------------------------------------------------------
  // Submit — chunked upload flow:
  //   1. POST /api/upload with metadata only (no files) → get submissionId
  //   2. POST each file individually to /api/submissions/:id/documents
  //      so no single request hits Vercel's 4.5 MB body limit
  //   3. Fire POST /api/analysis/:id to run the deep Sonnet analysis
  //   4. Navigate to /review/:id (the review page tolerates analysis
  //      still running or failing — it has its own "Re-run Analysis" button)
  // -------------------------------------------------------------------------
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (files.length === 0) {
      setError('Please upload at least one document.')
      return
    }
    if (!useExisting && !name.trim()) {
      setError('Subcontractor name is required.')
      return
    }

    setSubmitting(true)
    setProgress({ current: 0, total: files.length, label: 'Creating submission...' })
    try {
      // ---------------------------------------------------------------
      // Phase 1: init submission (metadata only, no files)
      // ---------------------------------------------------------------
      const initFd = new FormData()

      if (useExisting && existingSubId) {
        initFd.append('existing_sub_id', existingSubId)
        const sub = subcontractors.find((s) => s.id === parseInt(existingSubId))
        if (sub) {
          initFd.append('name', sub.name)
          initFd.append('trade', sub.trade || '')
          initFd.append('tier', sub.tier || 'primary')
          const match = classifyTrade(sub.trade)
          if (match) initFd.append('schedule_type', match.schedule.type)
        }
      } else {
        initFd.append('name', name)
        initFd.append('trade', trade)
        initFd.append('tier', tier)
        if (scheduleMatch) initFd.append('schedule_type', scheduleMatch.schedule.type)
      }

      if (procoreProjectId) initFd.append('procore_project_id', procoreProjectId)
      if (procoreContractId) initFd.append('procore_contract_id', procoreContractId)

      const initRes = await fetch('/api/upload', { method: 'POST', body: initFd })
      if (!initRes.ok) {
        throw new Error(await extractErrorMessage(initRes, 'Failed to create submission'))
      }
      const { submissionId } = await initRes.json()
      if (!submissionId) throw new Error('Server did not return a submissionId')

      // ---------------------------------------------------------------
      // Phase 2: upload files one at a time. Fail-fast on the first
      // error, but the already-uploaded files stay on the submission
      // so the user can resume from the Review page.
      // ---------------------------------------------------------------
      for (let i = 0; i < files.length; i++) {
        const f = files[i]
        setProgress({
          current: i + 1,
          total: files.length,
          label: `Uploading ${f.file.name} (${i + 1} of ${files.length})...`,
        })

        const fileFd = new FormData()
        fileFd.append('files', f.file)
        if (f.docType) {
          fileFd.append('doc_types', JSON.stringify({ [f.file.name]: f.docType }))
        }

        const fileRes = await fetch(`/api/submissions/${submissionId}/documents`, {
          method: 'POST',
          body: fileFd,
        })
        if (!fileRes.ok) {
          throw new Error(
            await extractErrorMessage(fileRes, `Failed to upload "${f.file.name}"`),
          )
        }
      }

      // ---------------------------------------------------------------
      // Phase 3: trigger deep AI analysis. Fire-and-forget — if it
      // fails or times out, the review page shows a "Re-run Analysis"
      // button. We still wait for the request to be accepted so the
      // server starts work before the client navigates away.
      // ---------------------------------------------------------------
      setProgress({ current: files.length, total: files.length, label: 'Running AI analysis...' })
      try {
        await fetch(`/api/analysis/${submissionId}`, { method: 'POST' })
      } catch (analysisErr) {
        // Non-fatal — the review page can re-run analysis on demand.
        console.warn('Analysis trigger failed (will retry on review page):', analysisErr)
      }

      router.push(`/review/${submissionId}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setSubmitting(false)
      setProgress(null)
    }
  }

  // Extract a useful error message from a failed fetch response. Handles
  // JSON error bodies, empty bodies (Vercel edge rejections), and HTML
  // error pages (gateway timeouts) — in each case we surface the HTTP
  // status so the user sees a concrete failure instead of "Upload failed".
  async function extractErrorMessage(res: Response, fallback: string): Promise<string> {
    const statusSuffix = `${res.status}${res.statusText ? ' ' + res.statusText : ''}`.trim()
    const text = await res.text().catch(() => '')
    if (text) {
      try {
        const body = JSON.parse(text)
        if (body?.error) return body.error
      } catch {
        // not JSON — likely an HTML error page from the edge
      }
    }
    if (res.status === 413) {
      return `${fallback}: file is too large for the server (${statusSuffix}). Remove or split files over ~4 MB.`
    }
    if (res.status === 504) {
      return `${fallback}: the server timed out processing the file (${statusSuffix}). Try again or upload fewer files at once.`
    }
    return `${fallback} (${statusSuffix})`
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Upload Documents</h1>
        <p className="text-gray-500 mt-1">
          Drop all insurance documents — AI identifies each type on the backend
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        {/* Subcontractor */}
        <div>
          <div className="flex items-center gap-4 mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={!useExisting} onChange={() => setUseExisting(false)} className="accent-slate-800" />
              <span className="text-sm font-medium text-gray-700">New Subcontractor</span>
            </label>
            {subcontractors.length > 0 && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={useExisting} onChange={() => setUseExisting(true)} className="accent-slate-800" />
                <span className="text-sm font-medium text-gray-700">Existing Subcontractor</span>
              </label>
            )}
          </div>

          {useExisting ? (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Select Subcontractor</label>
                <select
                  value={existingSubId}
                  onChange={(e) => setExistingSubId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                  required
                >
                  <option value="">— Select —</option>
                  {subcontractors.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.trade || 'No trade'})</option>
                  ))}
                </select>
              </div>
              {(() => {
                const sub = subcontractors.find((s) => s.id === parseInt(existingSubId))
                const match = sub ? classifyTrade(sub.trade) : null
                if (!match || !sub) return null
                const bgColor = match.schedule.type === 'A' ? 'bg-green-50 border-green-200'
                  : match.schedule.type === 'B' ? 'bg-yellow-50 border-yellow-200'
                  : 'bg-red-50 border-red-200'
                const badgeColor = match.schedule.type === 'A' ? 'bg-green-100 text-green-800'
                  : match.schedule.type === 'B' ? 'bg-yellow-100 text-yellow-800'
                  : 'bg-red-100 text-red-800'
                return (
                  <div className={`${bgColor} border rounded-lg px-4 py-3`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Suggested Schedule</span>
                      <span className={`inline-block px-2.5 py-0.5 rounded text-sm font-bold ${badgeColor}`}>
                        Schedule {match.schedule.type}
                      </span>
                    </div>
                    <p className="text-xs text-gray-700 mb-1">
                      Matched to <strong>{match.matchedTrade}</strong> requirements
                    </p>
                    <div className="flex gap-6 text-xs text-gray-600">
                      <span>Deductible: <strong>{formatCurrency(match.schedule.deductible)}</strong></span>
                      <span>Min Limits: <strong>{match.schedule.minLimits.map(formatCurrency).join(' / ')}</strong></span>
                    </div>
                  </div>
                )
              })()}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subcontractor Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Apex Electrical LLC"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                  required={!useExisting}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Trade</label>
                  <input
                    type="text"
                    list="trade-options"
                    value={trade}
                    onChange={(e) => setTrade(e.target.value)}
                    placeholder="e.g. Electrical (interior)"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                  />
                  <datalist id="trade-options">
                    {tradeOptions.map((t) => (
                      <option key={t} value={t} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tier</label>
                  <select
                    value={tier}
                    onChange={(e) => setTier(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                  >
                    <option value="primary">Primary</option>
                    <option value="second">Second Tier</option>
                  </select>
                </div>
              </div>

              {/* Suggested Schedule Assignment */}
              {trade && (
                <div className={`rounded-lg border px-4 py-3 text-sm ${
                  scheduleMatch
                    ? scheduleMatch.schedule.type === 'A' ? 'bg-green-50 border-green-200'
                      : scheduleMatch.schedule.type === 'B' ? 'bg-yellow-50 border-yellow-200'
                      : 'bg-red-50 border-red-200'
                    : 'bg-amber-50 border-amber-200'
                }`}>
                  {scheduleMatch ? (
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Suggested Schedule</span>
                        <span className={`inline-block px-2.5 py-0.5 rounded text-sm font-bold ${
                          scheduleMatch.schedule.type === 'A' ? 'bg-green-100 text-green-800'
                          : scheduleMatch.schedule.type === 'B' ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                        }`}>
                          Schedule {scheduleMatch.schedule.type}
                        </span>
                      </div>
                      <p className="text-gray-700 text-xs mb-1.5">
                        Matched to <strong>{scheduleMatch.matchedTrade}</strong>
                      </p>
                      <div className="flex gap-6 text-xs text-gray-600">
                        <span>Deductible: <strong>{formatCurrency(scheduleMatch.schedule.deductible)}</strong></span>
                        <span>
                          Min Limits: <strong>{scheduleMatch.schedule.minLimits.map(formatCurrency).join(' / ')}</strong>
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-amber-800">
                      No matching schedule found for &ldquo;{trade}&rdquo; — select a trade from the list above or verify manually.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <hr className="border-gray-200" />

        {/* Procore Linkage */}
        {procoreConfigured && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded font-medium">Procore</span>
              <p className="text-sm font-medium text-gray-700">Link to Procore Project</p>
              <span className="text-xs text-gray-400">(optional)</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Project</label>
                <select
                  value={procoreProjectId}
                  onChange={(e) => setProcoreProjectId(e.target.value)}
                  disabled={loadingProjects}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:bg-gray-50"
                >
                  <option value="">{loadingProjects ? 'Loading...' : '— No project —'}</option>
                  {procoreProjects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Commitment</label>
                <select
                  value={procoreContractId}
                  onChange={(e) => handleCommitmentChange(e.target.value)}
                  disabled={!procoreProjectId || loadingContracts}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:bg-gray-50"
                >
                  <option value="">
                    {!procoreProjectId ? '— Select project first —' : loadingContracts ? 'Loading...' : '— No commitment —'}
                  </option>
                  {procoreContracts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.number ? `#${c.number} ` : ''}{c.title}{c.vendor ? ` — ${c.vendor}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {procoreError && (
              <p className="text-xs text-amber-600 mt-1">{procoreError}</p>
            )}
          </div>
        )}

        {procoreConfigured && <hr className="border-gray-200" />}

        {/* Single drag & drop zone */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-3">Documents</p>

          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              dragOver
                ? 'border-slate-500 bg-slate-50'
                : 'border-gray-300 hover:border-gray-400 bg-gray-50/50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />

            <div className="flex flex-col items-center gap-2">
              <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-sm font-medium text-gray-600">
                Drop PDF files here, or click to browse
              </p>
              <p className="text-xs text-gray-400">
                ACORD 25, Policies, Endorsements — drop them all
              </p>
            </div>
          </div>
        </div>

        {/* File list with type assignment */}
        {files.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                {files.length} file{files.length !== 1 ? 's' : ''} queued
              </p>
              <p className="text-xs text-gray-400">Assign document types or leave as Auto-detect</p>
            </div>
            {files.map((f) => (
              <div
                key={f.id}
                className="flex items-center gap-3 bg-gray-50 rounded-lg border border-gray-200 px-4 py-2.5"
              >
                <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                </svg>
                <span className="text-sm text-gray-700 truncate flex-1 min-w-0">{f.file.name}</span>
                <select
                  value={f.docType}
                  onChange={(e) => updateFileType(f.id, e.target.value)}
                  className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-slate-500 bg-white min-w-[130px]"
                >
                  {DOC_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <span className="text-xs text-gray-400 whitespace-nowrap">{(f.file.size / 1024).toFixed(0)} KB</span>
                <button
                  type="button"
                  onClick={() => removeFile(f.id)}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-2 pt-2">
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting || files.length === 0}
              className="bg-[#0f172a] text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? 'Uploading & Analyzing...' : 'Submit for Review'}
            </button>
            <button
              type="button"
              onClick={() => router.push('/')}
              disabled={submitting}
              className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2.5 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          </div>
          {submitting && progress && (
            <div className="space-y-1">
              <p className="text-xs text-gray-500">{progress.label}</p>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-slate-700 transition-all duration-200"
                  style={{ width: `${(progress.current / Math.max(progress.total, 1)) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </form>
    </div>
  )
}
