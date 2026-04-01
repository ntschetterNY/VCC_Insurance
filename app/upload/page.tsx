'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Subcontractor {
  id: number
  name: string
  trade: string
  tier: string
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
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/subcontractors')
      .then((r) => r.json())
      .then((data) => setSubcontractors(data))
      .catch(() => {})
  }, [])

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
        <p className="text-gray-500 mt-1">Submit Accord 25 and policy documents for review</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        {/* Subcontractor */}
        <div>
          <div className="flex items-center gap-4 mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={!useExisting}
                onChange={() => setUseExisting(false)}
                className="accent-slate-800"
              />
              <span className="text-sm font-medium text-gray-700">New Subcontractor</span>
            </label>
            {subcontractors.length > 0 && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={useExisting}
                  onChange={() => setUseExisting(true)}
                  className="accent-slate-800"
                />
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
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.trade || 'No trade'})
                  </option>
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

        {/* File Uploads */}
        <div className="space-y-4">
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
            <p className="text-xs text-gray-400 mt-1">PDF only</p>
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
            <p className="text-xs text-gray-400 mt-1">PDF only</p>
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
            disabled={submitting}
            className="bg-[#0f172a] text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? 'Uploading & Analyzing…' : 'Submit for Review'}
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
