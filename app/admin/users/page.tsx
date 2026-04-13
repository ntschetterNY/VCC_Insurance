'use client'

import { useState, useEffect, useCallback } from 'react'

interface User {
  id: string
  email: string
  name: string
  role: string
  created_at: string
}

export default function AdminUsersPage() {
  const [currentUser, setCurrentUser] = useState<{ id: string; role: string } | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)

  // New user form
  const [showAddForm, setShowAddForm] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState('reviewer')
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState('')
  const [formLoading, setFormLoading] = useState(false)

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState('')
  const [editPassword, setEditPassword] = useState('')

  // Search/filter
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')

  const isAdmin = currentUser?.role === 'admin'

  const loadUsers = useCallback(async () => {
    const res = await fetch('/api/users')
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data)) setUsers(data)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(u => { if (u) setCurrentUser(u) }).catch(() => {})
    loadUsers()
  }, [loadUsers])

  const filtered = users.filter(u => {
    const matchesSearch = !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())
    const matchesRole = roleFilter === 'all' || u.role === roleFilter
    return matchesSearch && matchesRole
  })

  async function createUser(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    setFormSuccess('')
    setFormLoading(true)
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
      setFormSuccess(`${newName} (${newEmail}) created successfully.`)
      setNewEmail(''); setNewName(''); setNewPassword(''); setNewRole('reviewer')
      setShowAddForm(false)
      await loadUsers()
      setTimeout(() => setFormSuccess(''), 5000)
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setFormLoading(false)
    }
  }

  async function deleteUser(id: string, name: string) {
    if (!confirm(`Delete user "${name}"? This cannot be undone.`)) return
    await fetch(`/api/users/${id}`, { method: 'DELETE' })
    setUsers(users.filter(u => u.id !== id))
  }

  async function updateUser(id: string) {
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
  }

  if (!isAdmin && !loading) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <h2 className="text-lg font-semibold text-red-800">Access Denied</h2>
          <p className="text-sm text-red-600 mt-1">Only administrators can access user management.</p>
        </div>
      </div>
    )
  }

  const adminCount = users.filter(u => u.role === 'admin').length
  const reviewerCount = users.filter(u => u.role === 'reviewer').length

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Directory</h1>
          <p className="text-gray-500 mt-1">Manage team members and their access levels</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-slate-900 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-slate-700 transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add User
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Users</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{users.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Administrators</p>
          <p className="text-2xl font-bold text-purple-600 mt-1">{adminCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Reviewers</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{reviewerCount}</p>
        </div>
      </div>

      {/* Success/Error banners */}
      {formSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700 mb-4">
          {formSuccess}
        </div>
      )}

      {/* Add User Form */}
      {showAddForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Add New User</h2>
          <form onSubmit={createUser} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input
                  type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
                  required placeholder="Jane Smith"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                <input
                  type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
                  required placeholder="jane@company.com"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                  required minLength={8} placeholder="Min 8 characters"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={newRole} onChange={(e) => setNewRole(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                >
                  <option value="reviewer">Reviewer</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            {formError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>
            )}
            <div className="flex gap-3">
              <button
                type="submit" disabled={formLoading}
                className="bg-slate-900 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-50"
              >
                {formLoading ? 'Creating…' : 'Create User'}
              </button>
              <button
                type="button" onClick={() => { setShowAddForm(false); setFormError('') }}
                className="text-sm text-gray-500 hover:text-gray-700 px-3"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Search & Filter */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-4">
          <div className="flex-1">
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
            />
          </div>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1 text-xs">
            {['all', 'admin', 'reviewer'].map(role => (
              <button
                key={role}
                onClick={() => setRoleFilter(role)}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors capitalize ${
                  roleFilter === role ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {role}
              </button>
            ))}
          </div>
        </div>

        {/* User list */}
        {loading ? (
          <div className="px-6 py-12 text-center text-gray-400 text-sm">Loading users...</div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500 text-sm">No users found.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map((u) => (
              <div key={u.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                {editingId === u.id ? (
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-gray-500">Editing: {u.email}</p>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Name</label>
                        <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Role</label>
                        <select value={editRole} onChange={(e) => setEditRole(e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                        >
                          <option value="reviewer">Reviewer</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">New Password</label>
                        <input type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)}
                          placeholder="Leave blank to keep"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => updateUser(u.id)}
                        className="bg-slate-900 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-slate-700"
                      >Save</button>
                      <button onClick={() => { setEditingId(null); setEditName(''); setEditRole(''); setEditPassword('') }}
                        className="text-sm text-gray-500 hover:text-gray-700 px-3"
                      >Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center text-sm font-bold text-slate-700 shrink-0">
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{u.name}</p>
                      <p className="text-xs text-gray-500">{u.email}</p>
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                      u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {u.role}
                    </span>
                    <p className="text-xs text-gray-400 w-28 text-right">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                    </p>
                    <div className="flex gap-2 ml-2">
                      <button
                        onClick={() => { setEditingId(u.id); setEditName(u.name); setEditRole(u.role); setEditPassword('') }}
                        className="text-xs text-slate-500 hover:text-slate-700 font-medium"
                      >Edit</button>
                      {u.id !== currentUser?.id && (
                        <button onClick={() => deleteUser(u.id, u.name)}
                          className="text-xs text-red-500 hover:text-red-700 font-medium"
                        >Remove</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
