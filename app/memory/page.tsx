'use client'

import { useState, useEffect } from 'react'

interface MemoryEntry {
  id: number
  title: string
  description: string
  category: string
  severity: string
  active: boolean
  created_at: string
}

const categoryColors: Record<string, string> = {
  Exclusion: 'bg-red-100 text-red-800',
  'Common Mistake': 'bg-yellow-100 text-yellow-800',
  'Watch Item': 'bg-orange-100 text-orange-800',
  'Process Note': 'bg-blue-100 text-blue-800',
  'Review Check': 'bg-emerald-100 text-emerald-800',
}

function formatDate(d: string) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function MemoryPage() {
  const [entries, setEntries] = useState<MemoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('Process Note')
  const [severity, setSeverity] = useState('medium')
  const [submitting, setSubmitting] = useState(false)
  const [filter, setFilter] = useState('all')

  async function load() {
    const res = await fetch('/api/memory')
    const data = await res.json()
    setEntries(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function addEntry(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSubmitting(true)
    try {
      await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, category, severity }),
      })
      setTitle('')
      setDescription('')
      setCategory('Process Note')
      setSeverity('medium')
      await load()
    } finally {
      setSubmitting(false)
    }
  }

  async function del(id: number) {
    if (!confirm('Delete this memory entry?')) return
    await fetch(`/api/memory/${id}`, { method: 'DELETE' })
    await load()
  }

  async function toggleActive(id: number, active: boolean) {
    await fetch(`/api/memory/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !active }),
    })
    await load()
  }

  const filtered = filter === 'all' ? entries : entries.filter((e) => e.category === filter)
  const reviewChecks = entries.filter((e) => e.category === 'Review Check')
  const activeChecks = reviewChecks.filter((e) => e.active)

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Company Memory</h1>
          <p className="text-gray-500 mt-1">Institutional knowledge, flags, and process notes for insurance review</p>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 text-xs">
          {['all', 'Review Check', 'Exclusion', 'Watch Item', 'Process Note'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${filter === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {f === 'all' ? 'All' : f}
            </button>
          ))}
        </div>
      </div>

      {/* Review Checks summary banner */}
      {reviewChecks.length > 0 && filter !== 'all' && filter !== 'Review Check' ? null : (
        reviewChecks.length > 0 && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-3 mb-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-emerald-800">
                {activeChecks.length} active review check{activeChecks.length !== 1 ? 's' : ''} will be included in AI analysis
              </p>
              <p className="text-xs text-emerald-600 mt-0.5">
                These items are checked automatically during every document analysis.
              </p>
            </div>
            <span className="text-xs bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded-full font-medium">
              {activeChecks.length}/{reviewChecks.length}
            </span>
          </div>
        )
      )}

      {/* Cards Grid */}
      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200 mb-8">
          <p className="text-gray-500">
            {filter === 'all' ? 'No memory entries yet. Add one below.' : `No "${filter}" entries. Add one below.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
          {filtered.map((entry) => (
            <div key={entry.id} className={`bg-white rounded-xl border p-5 flex flex-col ${entry.category === 'Review Check' && !entry.active ? 'border-gray-200 opacity-60' : 'border-gray-200'}`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${categoryColors[entry.category] ?? 'bg-gray-100 text-gray-700'}`}>
                    {entry.category}
                  </span>
                  {entry.severity && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      entry.severity === 'high' ? 'bg-red-50 text-red-600' :
                      entry.severity === 'medium' ? 'bg-yellow-50 text-yellow-700' :
                      'bg-gray-50 text-gray-600'
                    }`}>
                      {entry.severity}
                    </span>
                  )}
                  {entry.category === 'Review Check' && (
                    <button
                      onClick={() => toggleActive(entry.id, entry.active)}
                      className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${
                        entry.active
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {entry.active ? 'Active' : 'Inactive'}
                    </button>
                  )}
                </div>
                <button
                  onClick={() => del(entry.id)}
                  className="text-gray-300 hover:text-red-500 transition-colors text-xs ml-2 shrink-0"
                  title="Delete"
                >
                  ✕
                </button>
              </div>
              <h3 className="text-sm font-semibold text-gray-900 mb-1">{entry.title}</h3>
              {entry.description && (
                <p className="text-sm text-gray-600 flex-1">{entry.description}</p>
              )}
              <p className="text-xs text-gray-400 mt-3">{formatDate(entry.created_at)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Add Form */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Add Memory Entry</h2>
        <form onSubmit={addEntry} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Always verify additional insured endorsement"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                >
                  <option>Review Check</option>
                  <option>Exclusion</option>
                  <option>Common Mistake</option>
                  <option>Watch Item</option>
                  <option>Process Note</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Severity</label>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Details, context, or instructions…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 resize-none"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="bg-[#0f172a] text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            {submitting ? 'Adding…' : 'Add Entry'}
          </button>
        </form>
      </div>
    </div>
  )
}
