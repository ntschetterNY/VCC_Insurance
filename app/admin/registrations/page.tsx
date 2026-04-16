'use client'

import { useCallback, useEffect, useState } from 'react'

interface RegistrationRequest {
  id: number
  email: string
  name: string
  company: string | null
  reason: string | null
  requested_role: string
  status: 'pending' | 'approved' | 'rejected'
  reviewed_by: string | null
  reviewed_at: string | null
  review_notes: string | null
  created_at: string
}

type Tab = 'pending' | 'approved' | 'rejected' | 'all'

export default function AdminRegistrationsPage() {
  const [requests, setRequests] = useState<RegistrationRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('pending')
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [credential, setCredential] = useState<{ email: string; temp_password: string } | null>(null)

  const load = useCallback(async (status: Tab) => {
    setLoading(true)
    const res = await fetch(`/api/admin/registrations?status=${status}`)
    if (res.ok) {
      const data = await res.json()
      setRequests(Array.isArray(data) ? data : [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { load(tab) }, [tab, load])

  async function approve(req: RegistrationRequest) {
    const role = window.prompt(
      `Grant role for ${req.name}? Enter "admin" or "reviewer" (default: reviewer).`,
      req.requested_role || 'reviewer'
    )
    if (role === null) return
    const picked = role.trim().toLowerCase() === 'admin' ? 'admin' : 'reviewer'

    setBusyId(req.id)
    setNotice(null)
    try {
      const res = await fetch(`/api/admin/registrations/${req.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', role: picked }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Failed to approve')
      setCredential({ email: body.email, temp_password: body.temp_password })
      setNotice({ kind: 'success', text: `Approved ${req.email} as ${picked}. Share the temporary password below.` })
      await load(tab)
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Failed to approve' })
    } finally {
      setBusyId(null)
    }
  }

  async function reject(req: RegistrationRequest) {
    const notes = window.prompt(`Reject ${req.email}? Optional reason:`, '')
    if (notes === null) return
    setBusyId(req.id)
    setNotice(null)
    try {
      const res = await fetch(`/api/admin/registrations/${req.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', notes }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Failed to reject')
      setNotice({ kind: 'success', text: `Rejected ${req.email}.` })
      await load(tab)
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Failed to reject' })
    } finally {
      setBusyId(null)
    }
  }

  const statusStyle: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Access Requests</h1>
        <p className="text-gray-500 mt-1">Review and approve new users who requested access.</p>
      </div>

      {notice && (
        <div className={`mb-4 border rounded-xl px-4 py-3 text-sm ${
          notice.kind === 'success'
            ? 'bg-green-50 border-green-200 text-green-700'
            : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {notice.text}
        </div>
      )}

      {credential && (
        <div className="mb-4 bg-slate-900 text-white rounded-xl px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold">Temporary credential created</p>
              <p className="text-sm mt-1">
                <span className="font-mono bg-slate-800 px-2 py-0.5 rounded">{credential.email}</span>
                <span className="mx-2">/</span>
                <span className="font-mono bg-slate-800 px-2 py-0.5 rounded">{credential.temp_password}</span>
              </p>
              <p className="text-xs text-slate-400 mt-2">
                The user will be prompted to set a new password on first login.
              </p>
            </div>
            <button onClick={() => setCredential(null)} className="text-slate-400 hover:text-white text-sm">
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-1 text-xs">
          {(['pending', 'approved', 'rejected', 'all'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-md font-medium capitalize transition-colors ${
                tab === t ? 'bg-slate-900 text-white' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="px-6 py-10 text-center text-sm text-gray-400">Loading…</div>
        ) : requests.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-gray-500">
            No {tab !== 'all' ? tab : ''} registration requests.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {requests.map((r) => (
              <div key={r.id} className="px-6 py-4">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center text-sm font-bold text-slate-700 shrink-0">
                    {r.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900">{r.name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusStyle[r.status] ?? 'bg-gray-100 text-gray-700'}`}>
                        {r.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">{r.email}</p>
                    {r.company && <p className="text-xs text-gray-500 mt-0.5">Company: {r.company}</p>}
                    {r.reason && (
                      <p className="text-xs text-gray-600 mt-1 italic">&ldquo;{r.reason}&rdquo;</p>
                    )}
                    <p className="text-[10px] text-gray-400 mt-1">
                      Requested {new Date(r.created_at).toLocaleString()}
                      {r.reviewed_at && ` · reviewed ${new Date(r.reviewed_at).toLocaleString()}`}
                    </p>
                  </div>
                  {r.status === 'pending' && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => approve(r)}
                        disabled={busyId === r.id}
                        className="bg-slate-900 text-white text-xs font-medium px-3 py-1.5 rounded-md hover:bg-slate-700 disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => reject(r)}
                        disabled={busyId === r.id}
                        className="text-xs font-medium text-red-600 hover:text-red-700 px-2"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
