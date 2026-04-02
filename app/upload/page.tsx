'use client'

import { useState, useEffect } from 'react'
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

// Extract text from a PDF file entirely in the browser (offloads processing from server)
async function extractPdfTextClientSide(file: File, maxChars = 5000): Promise<string> {
  try {
    const pdfjsLib = await import('pdfjs-dist')
    // Use unpkg CDN for the worker — no server-side processing needed
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
    console.warn('Client-side PDF extraction failed, server will extract:', err)
    return ''
  }
}

export default function UploadPage() {
  const router = useRouter()
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([])
  const [useExisting, setUseExisting] = useState(false)
  const [existingSubId, setExistingSubId] = useState('')
  const [name, setName] = useState('')
  const [trade, setTrade] = useState('')
  const [tier, setTier] = useState('primary')
  const [accord25, setAccord25] = useState<File | null>(null)
  const [policy, setPolicy] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [extractingText, setExtractingText] = useState(false)
  const [error, setError] = useState('')

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!accord25) {
      setError('Accord 25 form is required.')
      return
    }

    if (!useExisting && !name.trim()) {
      setError('Subcontractor name is required.')
      return
    }

    setSubmitting(true)
    try {
      // Extract text client-side to offload processing from the server
      setExtractingText(true)
      const [accord25Text, policyText] = await Promise.all([
        extractPdfTextClientSide(accord25, 5000),
        policy ? extractPdfTextClientSide(policy, 2500) : Promise.resolve(''),
      ])
      setExtractingText(false)

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
      fd.append('accord25', accord25)
      if (policy) fd.append('policy', policy)

      // Send pre-extracted text so server doesn't need to parse PDFs
      if (accord25Text) fd.append('accord25_text', accord25Text)
      if (policyText) fd.append('policy_text', policyText)

      // Procore linkage
      if (procoreProjectId) fd.append('procore_project_id', procoreProjectId)
      if (procoreContractId) fd.append('procore_contract_id', procoreContractId)

      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Upload failed')
      }
      const data = await res.json()
      router.push(`/review/${data.submissionId}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      setExtractingText(false)
    } finally {
      setSubmitting(false)
    }
  }

  const submitLabel = extractingText
    ? 'Extracting PDF text…'
    : submitting
    ? 'Uploading & Analyzing…'
    : 'Submit for Review'

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Upload Documents</h1>
        <p className="text-gray-500 mt-1">Submit Accord 25 and policy documents for AI-powered compliance review</p>
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
                  <option value="">{loadingProjects ? 'Loading…' : '— No project —'}</option>
                  {procoreProjects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Contract / Commitment</label>
                <select
                  value={procoreContractId}
                  onChange={(e) => setProcoreContractId(e.target.value)}
                  disabled={!procoreProjectId || loadingContracts}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:bg-gray-50"
                >
                  <option value="">
                    {!procoreProjectId ? '— Select project first —' : loadingContracts ? 'Loading…' : '— No contract —'}
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

        {/* File Uploads */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-medium text-gray-700">Documents</p>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">PDF text extracted in your browser</span>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Accord 25 Certificate of Insurance *
            </label>
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => setAccord25(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Full Policy Document <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => setPolicy(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
            />
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={submitting || extractingText}
            className="bg-[#0f172a] text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitLabel}
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
