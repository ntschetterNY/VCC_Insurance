'use client'

import { useState, useEffect, useCallback } from 'react'

interface User {
  id: string
  email: string
  name: string
  role: string
  created_at: string
}

interface ProcoreSettings {
  client_id: string
  client_secret: string
  company_id: string
  configured: boolean
  token_cached: boolean
  token_expiry: string | null
}

export default function SettingsPage() {
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string; role: string } | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [procore, setProcore] = useState<ProcoreSettings>({ client_id: '', client_secret: '', company_id: '', configured: false, token_cached: false, token_expiry: null })
  const [procoreLoading, setProcoreLoading] = useState(false)
  const [procoreSaved, setProcoreSaved] = useState(false)
  const [procoreTesting, setProcoreTesting] = useState(false)
  const [procoreTestResult, setProcoreTestResult] = useState('')

  // Setup state
  const [setupRequired, setSetupRequired] = useState(false)
  const [setupLoading, setSetupLoading] = useState(false)
  const [setupError, setSetupError] = useState('')

  // New user form
  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState('reviewer')
  const [userError, setUserError] = useState('')
  const [userSuccess, setUserSuccess] = useState('')
  const [userLoading, setUserLoading] = useState(false)

  // Edit user state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState('')
  const [editPassword, setEditPassword] = useState('')

  const isAdmin = currentUser?.role === 'admin'

  const loadUsers = useCallback(async () => {
    const res = await fetch('/api/users')
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data)) setUsers(data)
    }
  }, [])

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(u => { if (u) setCurrentUser(u) }).catch(() => {})
    fetch('/api/procore').then(r => r.ok ? r.json() : null).then(p => { if (p) setProcore(p) }).catch(() => {})
    fetch('/api/auth/setup').then(r => r.json()).then(data => setSetupRequired(data.setup_required)).catch(() => {})
    loadUsers()
  }, [loadUsers])

  async function claimAdmin() {
    setSetupLoading(true)
    setSetupError('')
    try {
      const res = await fetch('/api/auth/setup', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSetupRequired(false)
      // Refresh current user and users list
      const me = await fetch('/api/auth/me').then(r => r.json())
      setCurrentUser(me)
      await loadUsers()
    } catch (err: unknown) {
      setSetupError(err instanceof Error ? err.message : 'Setup failed')
    } finally {
      setSetupLoading(false)
    }
  }

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
          client_secret: procore.client_secret,
          company_id: procore.company_id,
        }),
      })
      setProcoreSaved(true)
      setTimeout(() => setProcoreSaved(false), 3000)
    } finally {
      setProcoreLoading(false)
    }
  }

  async function testProcoreConnection() {
    setProcoreTesting(true)
    setProcoreTestResult('')
    try {
      const res = await fetch('/api/procore', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setProcoreTestResult(`Error: ${data.error}`)
      } else {
        setProcoreTestResult(`Connected to: ${data.company_name}`)
      }
    } catch {
      setProcoreTestResult('Connection test failed')
    } finally {
      setProcoreTesting(false)
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
      await loadUsers()
    } catch (err: unknown) {
      setUserError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setUserLoading(false)
    }
  }

  async function deleteUser(id: string) {
    if (!confirm('Delete this user? This action cannot be undone.')) return
    await fetch(`/api/users/${id}`, { method: 'DELETE' })
    setUsers(users.filter(u => u.id !== id))
  }

  async function updateUser(id: string) {
    try {
      const body: Record<string, string> = {}
      if (editName) body.name = editName
      if (editRole) body.role = editRole
      if (editPassword) body.password = editPassword

      const res = await fetch(`/api/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error || 'Failed to update user')
        return
      }
      setEditingId(null)
      setEditName('')
      setEditRole('')
      setEditPassword('')
      await loadUsers()
    } catch {
      alert('Failed to update user')
    }
  }

  return (
    <div className="p-8 max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 mt-1">Configure integrations and manage user accounts</p>
      </div>

      {/* First-time Admin Setup Banner */}
      {setupRequired && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-6">
          <h2 className="text-lg font-bold text-amber-900 mb-2">First-Time Setup Required</h2>
          <p className="text-sm text-amber-800 mb-4">
            No admin user has been configured yet. Click below to set your current account as the administrator.
            This can only be done once.
          </p>
          {setupError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{setupError}</p>
          )}
          <button
            onClick={claimAdmin}
            disabled={setupLoading}
            className="bg-amber-600 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-amber-700 disabled:opacity-50 transition-colors"
          >
            {setupLoading ? 'Setting up…' : 'Set Me as Admin'}
          </button>
        </div>
      )}

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
          {currentUser && (
            <span className="ml-auto text-xs text-gray-400">
              Logged in as <span className="font-medium text-gray-600">{currentUser.name}</span>
              <span className={`ml-1.5 px-2 py-0.5 rounded-full font-medium ${currentUser.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                {currentUser.role}
              </span>
            </span>
          )}
        </div>

        <div className="p-6 space-y-6">
          {/* Existing users */}
          {users.length > 0 ? (
            <div className="space-y-2">
              {users.map((u) => (
                <div key={u.id} className="border border-gray-100 rounded-lg bg-gray-50">
                  {editingId === u.id ? (
                    <div className="p-4 space-y-3">
                      <p className="text-sm font-medium text-gray-700">Editing: {u.email}</p>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Name</label>
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder={u.name}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Role</label>
                          <select
                            value={editRole || u.role}
                            onChange={(e) => setEditRole(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                          >
                            <option value="reviewer">Reviewer</option>
                            <option value="admin">Admin</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">New Password</label>
                          <input
                            type="password"
                            value={editPassword}
                            onChange={(e) => setEditPassword(e.target.value)}
                            placeholder="Leave blank to keep"
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => updateUser(u.id)}
                          className="bg-slate-900 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-slate-700"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => { setEditingId(null); setEditName(''); setEditRole(''); setEditPassword('') }}
                          className="text-sm text-gray-500 hover:text-gray-700 px-3"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-3">
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
                      {isAdmin && (
                        <div className="flex gap-2 ml-2">
                          <button
                            onClick={() => { setEditingId(u.id); setEditName(u.name); setEditRole(u.role); setEditPassword('') }}
                            className="text-xs text-slate-500 hover:text-slate-700"
                          >
                            Edit
                          </button>
                          {u.id !== currentUser?.id && (
                            <button
                              onClick={() => deleteUser(u.id)}
                              className="text-xs text-red-500 hover:text-red-700"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">
              {setupRequired ? 'Complete the admin setup above to get started.' : 'No users found.'}
            </p>
          )}

          {/* Add user form — admin only */}
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
                    minLength={8}
                    placeholder="Min 8 characters"
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

          {!isAdmin && !setupRequired && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              Only administrators can manage user accounts. Contact your admin to request changes.
            </p>
          )}
        </div>
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
          <div className="grid grid-cols-3 gap-4">
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Client Secret</label>
              <input
                type="password"
                value={procore.client_secret}
                onChange={(e) => setProcore({ ...procore, client_secret: e.target.value })}
                disabled={!isAdmin}
                placeholder="Procore OAuth Client Secret"
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
                placeholder="e.g. 9539"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>
          </div>
          {procore.token_cached && (
            <p className="text-xs text-green-600">
              Access token cached{procore.token_expiry ? ` (expires ${new Date(procore.token_expiry).toLocaleString()})` : ''}. Tokens auto-refresh.
            </p>
          )}
          {isAdmin && (
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={procoreLoading}
                className="bg-slate-900 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-50"
              >
                {procoreLoading ? 'Saving…' : 'Save Settings'}
              </button>
              <button
                type="button"
                onClick={testProcoreConnection}
                disabled={procoreTesting || !procore.configured}
                className="border border-gray-300 text-gray-700 px-5 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
              >
                {procoreTesting ? 'Testing…' : 'Test Connection'}
              </button>
              {procoreSaved && <span className="text-sm text-green-600">Saved!</span>}
              {procoreTestResult && (
                <span className={`text-sm ${procoreTestResult.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
                  {procoreTestResult}
                </span>
              )}
            </div>
          )}
          <p className="text-xs text-gray-400 mt-2">
            Access tokens are auto-fetched using OAuth Client Credentials and cached until expiry.
          </p>
        </form>
      </div>
    </div>
  )
}
