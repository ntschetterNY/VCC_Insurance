'use client'

import { useState, useEffect } from 'react'

interface User {
  id: number
  email: string
  name: string
  role: string
  created_at: string
}

interface ProcoreSettings {
  client_id: string
  company_id: string
  access_token: string
  configured: boolean
}

export default function SettingsPage() {
  const [currentUser, setCurrentUser] = useState<{ id: number; name: string; role: string } | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [procore, setProcore] = useState<ProcoreSettings>({ client_id: '', company_id: '', access_token: '', configured: false })
  const [procoreLoading, setProcoreLoading] = useState(false)
  const [procoreSaved, setProcoreSaved] = useState(false)

  // New user form
  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState('reviewer')
  const [userError, setUserError] = useState('')
  const [userSuccess, setUserSuccess] = useState('')
  const [userLoading, setUserLoading] = useState(false)

  const isAdmin = currentUser?.role === 'admin'

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(setCurrentUser).catch(() => {})
    fetch('/api/procore').then(r => r.json()).then(setProcore).catch(() => {})
    if (isAdmin || true) { // load optimistically, will be empty for non-admins
      fetch('/api/users').then(r => r.json()).then(data => {
        if (Array.isArray(data)) setUsers(data)
      }).catch(() => {})
    }
  }, [isAdmin])

  async function saveProcore(e: React.FormEvent) {
    e.preventDefault()
    setProcoreLoading(true)
    setProcoreSaved(false)
    try {
      await fetch('/api/procore', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: procore.client_id,
          company_id: procore.company_id,
          access_token: procore.access_token,
        }),
      })
      setProcoreSaved(true)
      setTimeout(() => setProcoreSaved(false), 3000)
    } finally {
      setProcoreLoading(false)
    }
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault()
    setUserError('')
    setUserSuccess('')
    setUserLoading(true)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, name: newName, password: newPassword, role: newRole }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to create user')
      }
      setUserSuccess(`User ${newEmail} created successfully.`)
      setNewEmail(''); setNewName(''); setNewPassword(''); setNewRole('reviewer')
      // Reload users
      const updated = await fetch('/api/users').then(r => r.json())
      if (Array.isArray(updated)) setUsers(updated)
    } catch (err: unknown) {
      setUserError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setUserLoading(false)
    }
  }

  async function deleteUser(id: number) {
    if (!confirm('Delete this user? This action cannot be undone.')) return
    await fetch(`/api/users/${id}`, { method: 'DELETE' })
    setUsers(users.filter(u => u.id !== id))
  }

  return (
    <div className="p-8 max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 mt-1">Configure integrations and manage user accounts</p>
      </div>

      {/* Procore Integration */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-3">
          <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm0 5a1 1 0 011-1h6a1 1 0 010 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h6a1 1 0 010 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Procore Integration</h2>
            <p className="text-xs text-gray-500">Pull contracts from Procore projects for insurance logging</p>
          </div>
          {procore.configured && (
            <span className="ml-auto text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-medium">Connected</span>
          )}
        </div>
        <form onSubmit={saveProcore} className="p-6 space-y-4">
          {!isAdmin && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
              Only admins can edit Procore credentials.
            </p>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Client ID</label>
              <input
                type="text"
                value={procore.client_id}
                onChange={(e) => setProcore({ ...procore, client_id: e.target.value })}
                disabled={!isAdmin}
                placeholder="Procore OAuth Client ID"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company ID</label>
              <input
                type="text"
                value={procore.company_id}
                onChange={(e) => setProcore({ ...procore, company_id: e.target.value })}
                disabled={!isAdmin}
                placeholder="Your Procore Company ID"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Access Token</label>
            <input
              type="password"
              value={procore.access_token}
              onChange={(e) => setProcore({ ...procore, access_token: e.target.value })}
              disabled={!isAdmin}
              placeholder="Procore API Access Token"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:bg-gray-50 disabled:text-gray-400"
            />
            <p className="text-xs text-gray-400 mt-1">
              Generate via Procore Developer Portal → OAuth 2.0 → Service Account Token
            </p>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={procoreLoading}
                className="bg-slate-900 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-50"
              >
                {procoreLoading ? 'Saving…' : 'Save Procore Settings'}
              </button>
              {procoreSaved && <span className="text-sm text-green-600">Saved!</span>}
            </div>
          )}
        </form>
      </div>

      {/* User Management */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">User Accounts</h2>
            <p className="text-xs text-gray-500">Manage reviewer and admin accounts</p>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Existing users */}
          {users.length > 0 ? (
            <div className="space-y-2">
              {users.map((u) => (
                <div key={u.id} className="flex items-center gap-3 border border-gray-100 rounded-lg px-4 py-3 bg-gray-50">
                  <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-sm font-semibold text-slate-700">
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{u.name}</p>
                    <p className="text-xs text-gray-500">{u.email}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                    {u.role}
                  </span>
                  {isAdmin && u.id !== currentUser?.id && (
                    <button
                      onClick={() => deleteUser(u.id)}
                      className="text-xs text-red-500 hover:text-red-700 ml-2"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">No users found.</p>
          )}

          {/* Add user form */}
          {isAdmin && (
            <form onSubmit={createUser} className="border border-dashed border-gray-300 rounded-xl p-5 space-y-4">
              <p className="text-sm font-semibold text-gray-700">Add New User</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    required
                    placeholder="Jane Smith"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    required
                    placeholder="jane@company.com"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                  >
                    <option value="reviewer">Reviewer</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
              {userError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{userError}</p>
              )}
              {userSuccess && (
                <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{userSuccess}</p>
              )}
              <button
                type="submit"
                disabled={userLoading}
                className="bg-slate-900 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-50"
              >
                {userLoading ? 'Creating…' : 'Create User'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
