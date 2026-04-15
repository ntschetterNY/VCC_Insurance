'use client'

import { useState, useEffect } from 'react'

interface UsageData {
  period_days: number
  total_calls: number
  total_input_tokens: number
  total_output_tokens: number
  estimated_cost_usd: number
  by_model: Record<string, { calls: number; input_tokens: number; output_tokens: number }>
  by_function: Record<string, { calls: number; input_tokens: number; output_tokens: number }>
  by_day: Record<string, { calls: number; input_tokens: number; output_tokens: number }>
  recent_logs: {
    id: number
    model: string
    function_name: string
    input_tokens: number
    output_tokens: number
    submission_id: number | null
    created_at: string
  }[]
}

const MODEL_LABELS: Record<string, string> = {
  'claude-haiku-4-5-20251001': 'Haiku 4.5',
  'claude-sonnet-4-20250514': 'Sonnet 4',
}

const FUNCTION_LABELS: Record<string, string> = {
  classify: 'Document Classification',
  analyze: 'Deep Analysis',
}

const PRICING: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
  'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
}

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export default function UsagePage() {
  const [data, setData] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/usage?days=${days}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [days])

  if (loading) {
    return <div className="p-8 text-gray-500">Loading usage data...</div>
  }

  if (!data) {
    return <div className="p-8 text-red-600">Failed to load usage data.</div>
  }

  const sortedDays = Object.entries(data.by_day).sort(([a], [b]) => a.localeCompare(b))

  // Find max tokens in a day for bar chart scaling
  const maxDayTokens = Math.max(
    ...sortedDays.map(([, d]) => d.input_tokens + d.output_tokens),
    1,
  )

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Usage & Costs</h1>
          <p className="text-gray-500 mt-1">Token usage per model and function</p>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 text-xs">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${days === d ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total Calls</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{data.total_calls}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Input Tokens</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatTokens(data.total_input_tokens)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Output Tokens</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatTokens(data.total_output_tokens)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Est. Cost</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">${data.estimated_cost_usd.toFixed(2)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-8">
        {/* By Model */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Usage by Model</h2>
          {Object.keys(data.by_model).length === 0 ? (
            <p className="text-sm text-gray-400">No usage data yet.</p>
          ) : (
            <div className="space-y-4">
              {Object.entries(data.by_model).map(([model, usage]) => {
                const pricing = PRICING[model] ?? { input: 3, output: 15 }
                const cost =
                  (usage.input_tokens / 1_000_000) * pricing.input +
                  (usage.output_tokens / 1_000_000) * pricing.output
                return (
                  <div key={model} className="border border-gray-100 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-900">
                        {MODEL_LABELS[model] ?? model}
                      </span>
                      <span className="text-xs text-gray-500">{usage.calls} calls</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="text-gray-400">Input</p>
                        <p className="font-medium text-gray-700">{formatTokens(usage.input_tokens)}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Output</p>
                        <p className="font-medium text-gray-700">{formatTokens(usage.output_tokens)}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Cost</p>
                        <p className="font-medium text-emerald-600">${cost.toFixed(3)}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* By Function */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Usage by Function</h2>
          {Object.keys(data.by_function).length === 0 ? (
            <p className="text-sm text-gray-400">No usage data yet.</p>
          ) : (
            <div className="space-y-4">
              {Object.entries(data.by_function).map(([fn, usage]) => {
                const totalTokens = usage.input_tokens + usage.output_tokens
                return (
                  <div key={fn} className="border border-gray-100 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-900">
                        {FUNCTION_LABELS[fn] ?? fn}
                      </span>
                      <span className="text-xs text-gray-500">{usage.calls} calls</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="text-gray-400">Input</p>
                        <p className="font-medium text-gray-700">{formatTokens(usage.input_tokens)}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Output</p>
                        <p className="font-medium text-gray-700">{formatTokens(usage.output_tokens)}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Total</p>
                        <p className="font-medium text-gray-700">{formatTokens(totalTokens)}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Daily chart */}
      {sortedDays.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-8">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Daily Token Usage</h2>
          <div className="flex items-end gap-1" style={{ height: '120px' }}>
            {sortedDays.map(([day, usage]) => {
              const total = usage.input_tokens + usage.output_tokens
              const pct = (total / maxDayTokens) * 100
              const inputPct = total > 0 ? (usage.input_tokens / total) * pct : 0
              const outputPct = pct - inputPct
              return (
                <div
                  key={day}
                  className="flex-1 flex flex-col justify-end group relative"
                  title={`${formatDate(day)}: ${formatTokens(total)} tokens (${usage.calls} calls)`}
                >
                  <div className="flex flex-col">
                    <div
                      className="bg-orange-400 rounded-t"
                      style={{ height: `${Math.max(outputPct * 1.2, total > 0 ? 2 : 0)}px` }}
                    />
                    <div
                      className="bg-blue-500 rounded-b"
                      style={{ height: `${Math.max(inputPct * 1.2, total > 0 ? 2 : 0)}px` }}
                    />
                  </div>
                  <p className="text-[8px] text-gray-400 text-center mt-1 truncate">
                    {day.slice(5)}
                  </p>
                </div>
              )
            })}
          </div>
          <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-blue-500 rounded" />
              Input
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-orange-400 rounded" />
              Output
            </div>
          </div>
        </div>
      )}

      {/* Cost optimization tips */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-8">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Cost Optimization Notes</h2>
        <div className="space-y-2 text-sm text-gray-600">
          <div className="flex items-start gap-2">
            <span className="text-green-600 mt-0.5 shrink-0">+</span>
            <p><strong>PDF extraction is local</strong> — text is extracted server-side with pdf-parse, no AI tokens used for raw parsing.</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-green-600 mt-0.5 shrink-0">+</span>
            <p><strong>Classification uses Haiku</strong> (~5x cheaper than Sonnet) — only 2,000 chars sent per document.</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-green-600 mt-0.5 shrink-0">+</span>
            <p><strong>Text is truncated</strong> — ACORD 25 capped at 8K chars, policies at 4K chars to limit Sonnet token costs.</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-blue-600 mt-0.5 shrink-0">i</span>
            <p><strong>Primary cost driver:</strong> Deep analysis (Sonnet) accounts for ~95% of token costs. Each analysis uses ~8K-12K input tokens + ~2K-4K output tokens.</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-gray-400 mt-0.5 shrink-0">-</span>
            <p><strong>Python pre-processing would not reduce costs</strong> — text extraction is already server-side. The semantic analysis requires Claude regardless of pre-processing format (MD vs raw text).</p>
          </div>
        </div>
      </div>

      {/* Recent logs table */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-700">Recent API Calls</h2>
        </div>
        {data.recent_logs.length === 0 ? (
          <p className="p-6 text-sm text-gray-400">No API calls logged yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Time</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Model</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Function</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Input</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Output</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Submission</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.recent_logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{formatDateTime(log.created_at)}</td>
                    <td className="px-4 py-2.5 text-gray-700">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        log.model.includes('haiku') ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {MODEL_LABELS[log.model] ?? log.model}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-700 text-xs">{FUNCTION_LABELS[log.function_name] ?? log.function_name}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700 font-mono text-xs">{formatTokens(log.input_tokens)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700 font-mono text-xs">{formatTokens(log.output_tokens)}</td>
                    <td className="px-4 py-2.5 text-center">
                      {log.submission_id ? (
                        <a href={`/review/${log.submission_id}`} className="text-blue-600 hover:underline text-xs">
                          #{log.submission_id}
                        </a>
                      ) : (
                        <span className="text-gray-400 text-xs">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
