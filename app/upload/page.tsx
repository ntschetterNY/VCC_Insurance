'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'

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

interface QueuedFile {
  id: string
  file: File
}

// Find the best matching schedule entry for a given trade
function guessSchedule(trade: string, schedules: ScheduleEntry[]): ScheduleEntry | null {
  if (!trade.trim() || schedules.length === 0) return null
  const lower = trade.toLowerCase().trim()

  // Exact match first
  const exact = schedules.find((s) => s.trade.toLowerCase() === lower)
  if (exact) return exact

  // Partial match (trade contains or is contained by schedule trade)
  const partial = schedules.find(
    (s) => s.trade.toLowerCase().includes(lower) || lower.includes(s.trade.toLowerCase()),
  )
  if (partial) return partial

  // Keyword-based mapping for common construction trades
  const TRADE_KEYWORDS: Record<string, string[]> = {
    // Higher risk trades -> typically Schedule A (highest limits)
    'General Contractor': ['general', 'gc', 'construction manager', 'cm'],
    'Demolition': ['demo', 'demolition', 'abatement', 'asbestos'],
    'Roofing': ['roof', 'roofing', 'waterproofing'],
    'Structural Steel': ['steel', 'structural', 'iron', 'ironwork'],
    'Excavation': ['excavat', 'grading', 'earthwork', 'foundation'],

    // Medium risk trades -> typically Schedule B
    'Electrical': ['electric', 'electrical', 'wiring', 'low voltage'],
    'Plumbing': ['plumb', 'plumbing', 'piping', 'sprinkler', 'fire protection'],
    'HVAC': ['hvac', 'mechanical', 'heating', 'cooling', 'ventilation'],
    'Concrete': ['concrete', 'masonry', 'mason', 'brick', 'block'],
    'Carpentry': ['carpent', 'framing', 'millwork', 'cabinet'],

    // Lower risk trades -> typically Schedule C
    'Painting': ['paint', 'painting', 'coating', 'finish'],
    'Flooring': ['floor', 'flooring', 'tile', 'carpet'],
    'Landscaping': ['landscape', 'landscaping', 'irrigation'],
    'Cleaning': ['clean', 'cleaning', 'janitorial'],
    'Security': ['security', 'alarm', 'surveillance', 'access control'],
  }

  for (const [tradeName, keywords] of Object.entries(TRADE_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      const match = schedules.find((s) => s.trade.toLowerCase() === tradeName.toLowerCase())
      if (match) return match
    }
  }

  // Default: return first schedule entry with the most common group
  const groupCounts: Record<string, number> = {}
  for (const s of schedules) {
    groupCounts[s.schedule_group] = (groupCounts[s.schedule_group] || 0) + 1
  }
  const defaultGroup = Object.entries(groupCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'A'
  return schedules.find((s) => s.schedule_group === defaultGroup) ?? schedules[0]
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

  // Procore
  const [procoreConfigured, setProcoreConfigured] = useState(false)
  const [procoreProjects, setProcoreProjects] = useState<ProcoreProject[]>([])
  const [procoreProjectId, setProcoreProjectId] = useState('')
  const [procoreContracts, setProcoreContracts] = useState<ProcoreContract[]>([])
  const [procoreContractId, setProcoreContractId] = useState('')
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [loadingContracts, setLoadingContracts] = useState(false)
  const [procoreError, setProcoreError] = useState('')

  // Compute suggested schedule based on trade input
  const suggestedSchedule = guessSchedule(trade, schedules)
  const existingSub = subcontractors.find((s) => s.id === parseInt(existingSubId))
  const existingSchedule = existingSub ? guessSchedule(existingSub.trade, schedules) : null

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

  // -------------------------------------------------------------------------
  // Submit — sends raw PDFs; backend does extraction + classification
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
    try {
      const fd = new FormData()

      if (useExisting && existingSubId) {
        fd.append('existing_sub_id', existingSubId)
        const sub = subcontractors.find((s) => s.id === parseInt(existingSubId))
        if (sub) {
          fd.append('name', sub.name)
          fd.append('trade', sub.trade || '')
          fd.append('tier', sub.tier || 'primary')
        }
      } else {
        fd.append('name', name)
        fd.append('trade', trade)
        fd.append('tier', tier)
      }

      if (procoreProjectId) fd.append('procore_project_id', procoreProjectId)
      if (procoreContractId) fd.append('procore_contract_id', procoreContractId)

      // Append every PDF — backend will extract text & classify each one
      for (const f of files) {
        fd.append('files', f.file)
      }

      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Upload failed')
      }
      const data = await res.json()
      router.push(`/review/${data.submissionId}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setSubmitting(false)
    }
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
              {existingSchedule && existingSub && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                    existingSchedule.schedule_group === 'A' ? 'bg-blue-100 text-blue-800' :
                    existingSchedule.schedule_group === 'B' ? 'bg-purple-100 text-purple-800' :
                    existingSchedule.schedule_group === 'C' ? 'bg-amber-100 text-amber-800' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    Schedule {existingSchedule.schedule_group}
                  </span>
                  <span className="text-sm text-blue-800">
                    Matched to <strong>{existingSchedule.trade}</strong> requirements
                  </span>
                </div>
              )}
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
                    value={trade}
                    onChange={(e) => setTrade(e.target.value)}
                    placeholder="e.g. Electrical"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                    list="trade-suggestions"
                  />
                  <datalist id="trade-suggestions">
                    {schedules.map((s) => (
                      <option key={s.id} value={s.trade} />
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

              {/* Schedule auto-suggestion */}
              {suggestedSchedule && trade.trim() && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-3 mb-1.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                      suggestedSchedule.schedule_group === 'A' ? 'bg-blue-100 text-blue-800' :
                      suggestedSchedule.schedule_group === 'B' ? 'bg-purple-100 text-purple-800' :
                      suggestedSchedule.schedule_group === 'C' ? 'bg-amber-100 text-amber-800' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      Schedule {suggestedSchedule.schedule_group}
                    </span>
                    <span className="text-sm font-medium text-blue-800">
                      Suggested: {suggestedSchedule.trade}
                    </span>
                  </div>
                  <div className="text-xs text-blue-700 flex gap-4">
                    <span>GL: ${(suggestedSchedule.gl_per_occurrence / 1000000).toFixed(1)}M / ${(suggestedSchedule.gl_aggregate / 1000000).toFixed(1)}M</span>
                    <span>WC: ${(suggestedSchedule.workers_comp / 1000000).toFixed(1)}M</span>
                    <span>Umbrella: ${(suggestedSchedule.umbrella / 1000000).toFixed(1)}M</span>
                  </div>
                  {suggestedSchedule.trade.toLowerCase() !== trade.toLowerCase().trim() && (
                    <button
                      type="button"
                      onClick={() => setTrade(suggestedSchedule.trade)}
                      className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Use "{suggestedSchedule.trade}" as trade name
                    </button>
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
                  onChange={(e) => setProcoreContractId(e.target.value)}
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

        {/* File list */}
        {files.length > 0 && (
          <div className="space-y-1.5">
            {files.map((f) => (
              <div
                key={f.id}
                className="flex items-center gap-3 bg-gray-50 rounded-lg border border-gray-200 px-4 py-2.5"
              >
                <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                </svg>
                <span className="text-sm text-gray-700 truncate flex-1">{f.file.name}</span>
                <span className="text-xs text-gray-400">{(f.file.size / 1024).toFixed(0)} KB</span>
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

        <div className="flex items-center gap-3 pt-2">
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
            className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2.5"
          >
            Cancel
          </button>
          {submitting && (
            <span className="text-xs text-gray-400">AI is extracting text, classifying, and analyzing your documents...</span>
          )}
        </div>
      </form>
    </div>
  )
}
