'use client'

import { useState, useEffect, useMemo } from 'react'
import { SCHEDULE_DEFINITIONS, type ScheduleType } from '@/lib/scheduleClassification'

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

const SCHEDULE_ORDER: ScheduleType[] = ['A', 'B', 'C']

const SCHEDULE_COLORS: Record<string, { header: string; badge: string; row: string }> = {
  A: {
    header: 'bg-green-50 border-green-200',
    badge: 'bg-green-100 text-green-800',
    row: 'hover:bg-green-50/50',
  },
  B: {
    header: 'bg-yellow-50 border-yellow-200',
    badge: 'bg-yellow-100 text-yellow-800',
    row: 'hover:bg-yellow-50/50',
  },
  C: {
    header: 'bg-red-50 border-red-200',
    badge: 'bg-red-100 text-red-800',
    row: 'hover:bg-red-50/50',
  },
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
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  // Group entries by schedule_type
  const grouped = useMemo(() => {
    const groups: Record<string, ScheduleEntry[]> = { A: [], B: [], C: [], Unassigned: [] }
    for (const e of entries) {
      const key = e.schedule_type && ['A', 'B', 'C'].includes(e.schedule_type) ? e.schedule_type : 'Unassigned'
      groups[key].push(e)
    }
    // Sort trades alphabetically within each group
    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) => a.trade.localeCompare(b.trade))
    }
    return groups
  }, [entries])

  async function load() {
    const res = await fetch('/api/schedule')
    const data = await res.json()
    setEntries(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // Auto-fill deductible and limits when schedule_type changes in the form
  function handleScheduleTypeChange(value: string) {
    const scheduleType = value as ScheduleType | ''
    if (scheduleType && SCHEDULE_DEFINITIONS[scheduleType as ScheduleType]) {
      const def = SCHEDULE_DEFINITIONS[scheduleType as ScheduleType]
      setForm((f) => ({
        ...f,
        schedule_type: scheduleType,
        deductible: def.deductible,
        gl_per_occurrence: def.minLimits[0],
        gl_aggregate: def.minLimits[1],
        umbrella: def.minLimits[2],
      }))
    } else {
      setForm((f) => ({ ...f, schedule_type: value || null }))
    }
  }

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

  function startNew(scheduleType?: ScheduleType) {
    setEditId(null)
    const f = blank()
    if (scheduleType && SCHEDULE_DEFINITIONS[scheduleType]) {
      const def = SCHEDULE_DEFINITIONS[scheduleType]
      f.schedule_type = scheduleType
      f.deductible = def.deductible
      f.gl_per_occurrence = def.minLimits[0]
      f.gl_aggregate = def.minLimits[1]
      f.umbrella = def.minLimits[2]
    }
    setForm(f)
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

  function toggleCollapse(key: string) {
    setCollapsed((c) => ({ ...c, [key]: !c[key] }))
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Schedule of Requirements</h1>
          <p className="text-gray-500 mt-1">Minimum insurance limits organized by schedule classification</p>
        </div>
        <button
          onClick={() => startNew()}
          className="bg-[#0f172a] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors"
        >
          + Add Entry
        </button>
      </div>

      {/* Schedule Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {SCHEDULE_ORDER.map((type) => {
          const def = SCHEDULE_DEFINITIONS[type]
          const colors = SCHEDULE_COLORS[type]
          const count = grouped[type]?.length ?? 0
          return (
            <div key={type} className={`rounded-xl border p-4 ${colors.header}`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`inline-block px-2.5 py-1 rounded-lg text-sm font-bold ${colors.badge}`}>
                  Schedule {type}
                </span>
                <span className="text-xs text-gray-500">{count} trade{count !== 1 ? 's' : ''}</span>
              </div>
              <div className="space-y-1 text-sm text-gray-700">
                <div className="flex justify-between">
                  <span>Deductible:</span>
                  <span className="font-medium">{formatCurrency(def.deductible)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Min Limits:</span>
                  <span className="font-medium">{def.minLimits.map(formatCurrency).join(' / ')}</span>
                </div>
              </div>
            </div>
          )
        })}
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Schedule *</label>
                <select
                  value={form.schedule_type || ''}
                  onChange={(e) => handleScheduleTypeChange(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-slate-500"
                >
                  <option value="">— None —</option>
                  <option value="A">Schedule A — $75K ded / $3M limits</option>
                  <option value="B">Schedule B — $100K ded / $5M limits</option>
                  <option value="C">Schedule C — $75K ded / $10M limits</option>
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
                {saving ? 'Saving...' : editId !== null ? 'Save Changes' : 'Add Entry'}
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

      {/* Grouped Tables by Schedule */}
      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : (
        <div className="space-y-6">
          {SCHEDULE_ORDER.map((type) => {
            const trades = grouped[type]
            if (!trades || trades.length === 0) return null
            const colors = SCHEDULE_COLORS[type]
            const def = SCHEDULE_DEFINITIONS[type]
            const isCollapsed = collapsed[type]

            return (
              <div key={type} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Schedule Group Header */}
                <button
                  onClick={() => toggleCollapse(type)}
                  className={`w-full flex items-center justify-between px-5 py-4 border-b ${colors.header} transition-colors`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`inline-block px-2.5 py-1 rounded-lg text-sm font-bold ${colors.badge}`}>
                      Schedule {type}
                    </span>
                    <span className="text-sm text-gray-600">
                      Deductible: <strong>{formatCurrency(def.deductible)}</strong>
                      <span className="mx-2 text-gray-300">|</span>
                      Min Limits: <strong>{def.minLimits.map(formatCurrency).join(' / ')}</strong>
                    </span>
                    <span className="text-xs text-gray-400">({trades.length} trade{trades.length !== 1 ? 's' : ''})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); startNew(type) }}
                      className="text-xs text-gray-500 hover:text-gray-800 bg-white border border-gray-300 rounded px-2 py-1 hover:bg-gray-50"
                    >
                      + Add
                    </button>
                    <svg
                      className={`w-5 h-5 text-gray-400 transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {/* Trade Rows */}
                {!isCollapsed && (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Trade</th>
                        <th className="px-5 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Deductible</th>
                        <th className="px-5 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">GL / Occ</th>
                        <th className="px-5 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">GL Agg</th>
                        <th className="px-5 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Workers Comp</th>
                        <th className="px-5 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Auto</th>
                        <th className="px-5 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Umbrella</th>
                        <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</th>
                        <th className="px-5 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {trades.map((e) => (
                        <tr key={e.id} className={`transition-colors ${colors.row}`}>
                          <td className="px-5 py-3 font-medium text-gray-900">{e.trade}</td>
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
            )
          })}

          {/* Unassigned trades */}
          {grouped.Unassigned.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <button
                onClick={() => toggleCollapse('Unassigned')}
                className="w-full flex items-center justify-between px-5 py-4 border-b bg-gray-50 border-gray-200 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-block px-2.5 py-1 rounded-lg text-sm font-bold bg-gray-200 text-gray-700">
                    Unassigned
                  </span>
                  <span className="text-sm text-gray-500">
                    Trades not yet assigned to a schedule
                  </span>
                  <span className="text-xs text-gray-400">({grouped.Unassigned.length} trade{grouped.Unassigned.length !== 1 ? 's' : ''})</span>
                </div>
                <svg
                  className={`w-5 h-5 text-gray-400 transition-transform ${collapsed.Unassigned ? '' : 'rotate-180'}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {!collapsed.Unassigned && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Trade</th>
                      <th className="px-5 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Deductible</th>
                      <th className="px-5 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">GL / Occ</th>
                      <th className="px-5 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">GL Agg</th>
                      <th className="px-5 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Workers Comp</th>
                      <th className="px-5 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Auto</th>
                      <th className="px-5 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Umbrella</th>
                      <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</th>
                      <th className="px-5 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {grouped.Unassigned.map((e) => (
                      <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3 font-medium text-gray-900">{e.trade}</td>
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
          )}

          {entries.length === 0 && (
            <p className="text-gray-500 text-sm text-center py-12">No schedule entries yet.</p>
          )}
        </div>
      )}
    </div>
  )
}
