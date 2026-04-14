'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface Subcontractor {
  id: number
  name: string
  trade: string
  tier: string
}

interface ProcoreProject {
  id: number
  name: string
}

interface ProcoreContract {
  id: number
  title: string
  number: string
  vendor: string
}

type DocType =
  | 'accord25'
  | 'accord28'
  | 'policy_gl'
  | 'policy_excess'
  | 'policy_wc'
  | 'policy_auto'
  | 'endorsement'
  | 'contract'
  | 'other'

const DOC_TYPE_LABELS: Record<DocType, string> = {
  accord25: 'ACORD 25 — Certificate of Liability',
  accord28: 'ACORD 28 — Evidence of Property Insurance',
  policy_gl: 'Policy — General Liability',
  policy_excess: 'Policy — Excess / Umbrella',
  policy_wc: 'Policy — Workers Compensation',
  policy_auto: 'Policy — Commercial Auto',
  endorsement: 'Endorsement',
  contract: 'Contract',
  other: 'Other',
}

interface UploadedFile {
  id: string
  file: File
  extractedText: string
  classification: {
    doc_type: DocType
    confidence: number
    description: string
  } | null
  classifying: boolean
  error: string | null
}

// ---------------------------------------------------------------------------
// Client-side PDF text extraction (runs entirely in the browser)
// ---------------------------------------------------------------------------
async function extractPdfTextClientSide(file: File, maxChars = 5000): Promise<string> {
  try {
    const pdfjsLib = await import('pdfjs-dist')
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`

    const arrayBuffer = await file.arrayBuffer()
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) })
    const pdf = await loadingTask.promise

    let fullText = ''
    const pagesToProcess = Math.min(pdf.numPages, 8)
    for (let i = 1; i <= pagesToProcess; i++) {
      const page = await pdf.getPage(i)
      const textContent = await page.getTextContent()
      const pageText = textContent.items
        .filter((item) => 'str' in item)
        .map((item) => (item as { str: string }).str)
        .join(' ')
      fullText += pageText + '\n'
      if (fullText.length >= maxChars) break
    }
    return fullText.slice(0, maxChars)
  } catch (err) {
    console.warn('Client-side PDF extraction failed:', err)
    return ''
  }
}

// ---------------------------------------------------------------------------
// Classify a file via the /api/classify endpoint (uses Haiku)
// ---------------------------------------------------------------------------
async function classifyFile(text: string): Promise<{
  doc_type: DocType
  confidence: number
  description: string
}> {
  const res = await fetch('/api/classify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })

  if (!res.ok) {
    throw new Error('Classification request failed')
  }

  return res.json()
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function UploadPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([])
  const [useExisting, setUseExisting] = useState(false)
  const [existingSubId, setExistingSubId] = useState('')
  const [name, setName] = useState('')
  const [trade, setTrade] = useState('')
  const [tier, setTier] = useState('primary')
  const [files, setFiles] = useState<UploadedFile[]>([])
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

  useEffect(() => {
    fetch('/api/subcontractors').then((r) => r.json()).then(setSubcontractors).catch(() => {})
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
      return
    }
    setLoadingContracts(true)
    setProcoreContractId('')
    fetch(`/api/procore/projects/${procoreProjectId}/contracts`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setProcoreContracts(data) })
      .catch(() => {})
      .finally(() => setLoadingContracts(false))
  }, [procoreProjectId])

  // -------------------------------------------------------------------------
  // Process dropped/selected files: extract text → classify with Haiku
  // -------------------------------------------------------------------------
  const processFiles = useCallback(async (newFiles: FileList | File[]) => {
    const pdfFiles = Array.from(newFiles).filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    )

    if (pdfFiles.length === 0) {
      setError('Please upload PDF files only.')
      return
    }

    // Create placeholder entries
    const entries: UploadedFile[] = pdfFiles.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      extractedText: '',
      classification: null,
      classifying: true,
      error: null,
    }))

    setFiles((prev) => [...prev, ...entries])
    setError('')

    // Process each file: extract text then classify
    for (const entry of entries) {
      try {
        const text = await extractPdfTextClientSide(entry.file, 5000)

        if (!text || text.trim().length < 20) {
          setFiles((prev) =>
            prev.map((f) =>
              f.id === entry.id
                ? { ...f, classifying: false, error: 'Could not extract text — PDF may be image-based' }
                : f
            )
          )
          continue
        }

        // Update extracted text
        setFiles((prev) =>
          prev.map((f) => (f.id === entry.id ? { ...f, extractedText: text } : f))
        )

        // Classify with Haiku
        const classification = await classifyFile(text)

        setFiles((prev) =>
          prev.map((f) =>
            f.id === entry.id
              ? { ...f, classification, classifying: false }
              : f
          )
        )
      } catch {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === entry.id
              ? { ...f, classifying: false, error: 'Classification failed' }
              : f
          )
        )
      }
    }
  }, [])

  // -------------------------------------------------------------------------
  // Drag & drop handlers
  // -------------------------------------------------------------------------
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDragOver(false)
      if (e.dataTransfer.files.length > 0) {
        processFiles(e.dataTransfer.files)
      }
    },
    [processFiles]
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        processFiles(e.target.files)
        // Reset the input so the same file can be selected again
        e.target.value = ''
      }
    },
    [processFiles]
  )

  // -------------------------------------------------------------------------
  // Remove a file from the list
  // -------------------------------------------------------------------------
  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }, [])

  // -------------------------------------------------------------------------
  // Override classification manually
  // -------------------------------------------------------------------------
  const overrideClassification = useCallback((id: string, docType: DocType) => {
    setFiles((prev) =>
      prev.map((f) =>
        f.id === id && f.classification
          ? { ...f, classification: { ...f.classification, doc_type: docType, confidence: 1 } }
          : f
      )
    )
  }, [])

  // -------------------------------------------------------------------------
  // Submit
  // -------------------------------------------------------------------------
  const hasAccord25 = files.some(
    (f) => f.classification?.doc_type === 'accord25' && !f.error
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const classifiedFiles = files.filter((f) => f.classification && !f.error)
    if (classifiedFiles.length === 0) {
      setError('Please upload at least one document.')
      return
    }

    if (!hasAccord25) {
      setError('An ACORD 25 certificate is required. Please upload one or correct the classification of an existing file.')
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

      // Procore linkage
      if (procoreProjectId) fd.append('procore_project_id', procoreProjectId)
      if (procoreContractId) fd.append('procore_contract_id', procoreContractId)

      // Append each classified file with its metadata
      const fileMeta: Array<{ doc_type: string; filename: string; extracted_text: string }> = []

      for (const f of classifiedFiles) {
        fd.append('files', f.file)
        fileMeta.push({
          doc_type: f.classification!.doc_type,
          filename: f.file.name,
          extracted_text: f.extractedText,
        })
      }

      fd.append('file_metadata', JSON.stringify(fileMeta))

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

  // -------------------------------------------------------------------------
  // Confidence badge color
  // -------------------------------------------------------------------------
  function confidenceColor(confidence: number) {
    if (confidence >= 0.85) return 'bg-green-100 text-green-700'
    if (confidence >= 0.6) return 'bg-yellow-100 text-yellow-700'
    return 'bg-red-100 text-red-700'
  }

  const anyClassifying = files.some((f) => f.classifying)

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Upload Documents</h1>
        <p className="text-gray-500 mt-1">
          Drop all insurance documents and AI will identify each type automatically
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
                  />
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
          </div>
        )}

        {procoreConfigured && <hr className="border-gray-200" />}

        {/* Drag & Drop Zone */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <p className="text-sm font-medium text-gray-700">Documents</p>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
              AI identifies document types automatically
            </span>
          </div>

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

        {/* File List with Classifications */}
        {files.length > 0 && (
          <div className="space-y-2">
            {files.map((f) => (
              <div
                key={f.id}
                className="flex items-start gap-3 bg-gray-50 rounded-lg border border-gray-200 px-4 py-3"
              >
                {/* PDF icon */}
                <div className="flex-shrink-0 mt-0.5">
                  <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                  </svg>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{f.file.name}</p>

                  {f.classifying && (
                    <div className="flex items-center gap-2 mt-1">
                      <div className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs text-gray-500">Identifying document type...</span>
                    </div>
                  )}

                  {f.error && (
                    <p className="text-xs text-red-600 mt-1">{f.error}</p>
                  )}

                  {f.classification && !f.classifying && (
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                      <select
                        value={f.classification.doc_type}
                        onChange={(e) => overrideClassification(f.id, e.target.value as DocType)}
                        className="text-xs border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-slate-400"
                      >
                        {Object.entries(DOC_TYPE_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${confidenceColor(f.classification.confidence)}`}>
                        {Math.round(f.classification.confidence * 100)}%
                      </span>
                      <span className="text-xs text-gray-400 truncate">{f.classification.description}</span>
                    </div>
                  )}
                </div>

                {/* Remove button */}
                <button
                  type="button"
                  onClick={() => removeFile(f.id)}
                  className="flex-shrink-0 text-gray-400 hover:text-red-500 transition-colors mt-0.5"
                  title="Remove file"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Missing Accord 25 warning */}
        {files.length > 0 && !hasAccord25 && !anyClassifying && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700">
            No ACORD 25 detected. Please upload one or correct a document&apos;s classification above.
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
            disabled={submitting || anyClassifying || files.length === 0}
            className="bg-[#0f172a] text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {anyClassifying
              ? 'Classifying Documents...'
              : submitting
              ? 'Uploading & Analyzing...'
              : 'Submit for Review'}
          </button>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2.5"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
