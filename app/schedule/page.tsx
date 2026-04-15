'use client'

import { useState, useEffect } from 'react'

interface ScheduleEntry {
  id: number
  trade: string
  schedule_type: string | null
  deductible: number | null
  schedule_group: string
  gl_per_occurrence: number
  gl_aggregate: number
  workers_comp: number
  auto_liability: number
  umbrella: number
  notes: string
}

const SCHEDULE_GROUPS = ['A', 'B', 'C', 'D']

const GROUP_COLORS: Record<string, string> = {
  A: 'bg-blue-100 text-blue-800',
  B: 'bg-purple-100 text-purple-800',
  C: 'bg-amber-100 text-amber-800',
  D: 'bg-gray-100 text-gray-700',
}

const blank = (): Omit<ScheduleEntry, 'id'> => ({
  trade: '',
  schedule_type: null,
  deductible: null,
  schedule_group: 'A',
  gl_per_occurrence: 0,
  gl_aggregate: 0,
  workers_comp: 0,
  auto_liability: 0,
  umbrella: 0,
  notes: '',
})

function formatCurrency(v: number) {
  if (!v) return '—'
  if (v >= 1000000) return `$${(v / 1000000).toFixed(v % 1000000 === 0 ? 0 : 1)}M`
  if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`
  return `$${v}`
}

export default function SchedulePage() {
  const [entries, setEntries] = useState<ScheduleEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState(blank())
  const [saving, setSaving] = useState(false)

  async function load() {
    const res = await fetch('/api/schedule')
    const data = await res.json()
    setEntries(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function startEdit(entry: ScheduleEntry) {
    setEditId(entry.id)
    setForm({
      trade: entry.trade,
      schedule_type: entry.schedule_type,
      deductible: entry.deductible,
      schedule_group: entry.schedule_group || 'A',
      gl_per_occurrence: entry.gl_per_occurrence,
      gl_aggregate: entry.gl_aggregate,
      workers_comp: entry.workers_comp,
      auto_liability: entry.auto_liability,
      umbrella: entry.umbrella,
      notes: entry.notes || '',
    })
    setShowForm(true)
  }

  function startNew() {
    setEditId(null)
    setForm(blank())
    setShowForm(true)
  }

  function cancel() {
    setShowForm(false)
    setEditId(null)
    setForm(blank())
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      if (editId !== null) {
        await fetch(`/api/schedule/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
      } else {
        await fetch('/api/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
      }
      await load()
      cancel()
    } finally {
      setSaving(false)
    }
  }

  async function del(id: number) {
    if (!confirm('Delete this schedule entry?')) return
    await fetch(`/api/schedule/${id}`, { method: 'DELETE' })
    await load()
  }

  function setField(key: keyof typeof form, value: string | number) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Schedule of Requirements</h1>
          <p className="text-gray-500 mt-1">Minimum insurance limits by trade</p>
        </div>
        <button
          onClick={startNew}
          className="bg-[#0f172a] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors"
        >
          + Add Entry
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            {editId !== null ? 'Edit Entry' : 'New Schedule Entry'}
          </h2>
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Trade *</label>
                <input
                  type="text"
                  value={form.trade}
                  onChange={(e) => setField('trade', e.target.value)}
                  placeholder="e.g. Electrical (interior)"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-slate-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Schedule</label>
                <select
                  value={form.schedule_type || ''}
                  onChange={(e) => setField('schedule_type', e.target.value || null as unknown as string)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-slate-500"
                >
                  <option value="">— None —</option>
                  <option value="A">Schedule A</option>
                  <option value="B">Schedule B</option>
                  <option value="C">Schedule C</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Deductible ($)</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={form.deductible ?? 0}
                  onChange={(e) => setField('deductible', parseInt(e.target.value) || 0)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-slate-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                { key: 'gl_per_occurrence', label: 'GL Per Occurrence ($)' },
                { key: 'gl_aggregate', label: 'GL Aggregate ($)' },
                { key: 'workers_comp', label: 'Workers Comp ($)' },
                { key: 'auto_liability', label: 'Auto Liability ($)' },
                { key: 'umbrella', label: 'Umbrella / Excess ($)' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={form[key as keyof typeof form] as number}
                    onChange={(e) => setField(key as keyof typeof form, parseInt(e.target.value) || 0)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-slate-500"
                  />
                </div>
              ))}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setField('notes', e.target.value)}
                placeholder="Optional notes"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-slate-500"
              />
            </div>
            <div className="flex gap-3 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="bg-[#0f172a] text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : editId !== null ? 'Save Changes' : 'Add Entry'}
              </button>
              <button
                type="button"
                onClick={cancel}
                className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        {loading ? (
          <p className="p-6 text-gray-500 text-sm">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="p-6 text-gray-500 text-sm">No schedule entries yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Trade</th>
                <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Schedule</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Deductible</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">GL / Occ</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">GL Agg</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Workers Comp</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Auto</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Umbrella</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</th>
                <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 font-medium text-gray-900">{e.trade}</td>
                  <td className="px-5 py-3 text-center">
                    {e.schedule_type ? (
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                        e.schedule_type === 'A' ? 'bg-green-100 text-green-800' :
                        e.schedule_type === 'B' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {e.schedule_type}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-5 py-3 text-right text-gray-700">{e.deductible ? formatCurrency(e.deductible) : '—'}</td>
                  <td className="px-5 py-3 text-right text-gray-700">{formatCurrency(e.gl_per_occurrence)}</td>
                  <td className="px-5 py-3 text-right text-gray-700">{formatCurrency(e.gl_aggregate)}</td>
                  <td className="px-5 py-3 text-right text-gray-700">{formatCurrency(e.workers_comp)}</td>
                  <td className="px-5 py-3 text-right text-gray-700">{formatCurrency(e.auto_liability)}</td>
                  <td className="px-5 py-3 text-right text-gray-700">{formatCurrency(e.umbrella)}</td>
                  <td className="px-5 py-3 text-gray-500 text-xs max-w-[180px] truncate">{e.notes || '—'}</td>
                  <td className="px-5 py-3 text-center">
                    <div className="flex items-center justify-center gap-3">
                      <button
                        onClick={() => startEdit(e)}
                        className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => del(e.id)}
                        className="text-red-500 hover:text-red-700 text-xs font-medium"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
