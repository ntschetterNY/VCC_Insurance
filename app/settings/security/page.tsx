'use client'

import { useState, useEffect } from 'react'

interface MfaFactor {
  id: string
  friendly_name: string
  status: string
}

export default function SecuritySettingsPage() {
  const [factors, setFactors] = useState<MfaFactor[]>([])
  const [enrolling, setEnrolling] = useState(false)
  const [qrCode, setQrCode] = useState('')
  const [secret, setSecret] = useState('')
  const [factorId, setFactorId] = useState('')
  const [verifyCode, setVerifyCode] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadFactors()
  }, [])

  async function loadFactors() {
    try {
      const res = await fetch('/api/auth/me')
      if (!res.ok) return
      // For now we check factors via the enroll API indirectly
      // Factors are shown if enrolled
      setLoading(false)
    } catch {
      setLoading(false)
    }
  }

  async function startEnroll() {
    setError('')
    setMessage('')
    setEnrolling(true)
    try {
      const res = await fetch('/api/auth/mfa/enroll', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setQrCode(data.qr_code)
      setSecret(data.secret)
      setFactorId(data.factor_id)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to start enrollment')
      setEnrolling(false)
    }
  }

  async function confirmEnroll() {
    setError('')
    try {
      const res = await fetch('/api/auth/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ factor_id: factorId, code: verifyCode }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMessage('Two-factor authentication has been enabled successfully!')
      setEnrolling(false)
      setQrCode('')
      setSecret('')
      setVerifyCode('')
      setFactors(prev => [...prev, { id: factorId, friendly_name: 'Authenticator', status: 'verified' }])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed')
    }
  }

  async function removeFactor(fId: string) {
    setError('')
    setMessage('')
    try {
      const res = await fetch('/api/auth/mfa/unenroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ factor_id: fId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setFactors(prev => prev.filter(f => f.id !== fId))
      setMessage('Two-factor authentication has been removed.')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to remove 2FA')
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse text-gray-400">Loading security settings...</div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-2">Security Settings</h1>
      <p className="text-gray-500 mb-8">Manage your two-factor authentication and account security.</p>

      {/* Status messages */}
      {message && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700 mb-6">
          {message}
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mb-6">
          {error}
        </div>
      )}

      {/* 2FA Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Two-Factor Authentication (2FA)</h2>
            <p className="text-sm text-gray-500 mt-1">
              Add an extra layer of security using a TOTP authenticator app.
            </p>
          </div>
          <div className={`px-3 py-1 rounded-full text-xs font-medium ${
            factors.length > 0 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
          }`}>
            {factors.length > 0 ? 'Enabled' : 'Not enabled'}
          </div>
        </div>

        {/* Existing factors */}
        {factors.map(f => (
          <div key={f.id} className="flex items-center justify-between bg-gray-50 rounded-xl p-4 mb-4">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <div>
                <p className="text-sm font-medium">{f.friendly_name || 'Authenticator App'}</p>
                <p className="text-xs text-gray-400">TOTP - {f.status}</p>
              </div>
            </div>
            <button
              onClick={() => removeFactor(f.id)}
              className="text-sm text-red-600 hover:text-red-700 font-medium"
            >
              Remove
            </button>
          </div>
        ))}

        {/* Enrollment flow */}
        {!enrolling ? (
          <button
            onClick={startEnroll}
            className="w-full bg-slate-900 text-white py-3 rounded-xl text-sm font-semibold hover:bg-slate-700 transition-colors"
          >
            {factors.length > 0 ? 'Add Another Authenticator' : 'Set Up Two-Factor Authentication'}
          </button>
        ) : (
          <div className="space-y-6">
            <div className="border-t pt-6">
              <h3 className="font-medium mb-3">1. Scan this QR code with your authenticator app</h3>
              <p className="text-sm text-gray-500 mb-4">
                Use Google Authenticator, Authy, 1Password, or any TOTP app.
              </p>
              {qrCode && (
                <div className="flex justify-center mb-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrCode} alt="2FA QR Code" className="w-48 h-48 rounded-lg border" />
                </div>
              )}
              {secret && (
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">Or enter this code manually:</p>
                  <code className="text-sm font-mono font-bold tracking-wider select-all">{secret}</code>
                </div>
              )}
            </div>

            <div>
              <h3 className="font-medium mb-3">2. Enter the 6-digit verification code</h3>
              <div className="flex gap-3">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="flex-1 border border-gray-300 rounded-xl px-4 py-3 text-center text-lg font-mono tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-slate-500"
                />
                <button
                  onClick={confirmEnroll}
                  disabled={verifyCode.length !== 6}
                  className="bg-slate-900 text-white px-6 py-3 rounded-xl text-sm font-semibold hover:bg-slate-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Verify
                </button>
              </div>
            </div>

            <button
              onClick={() => { setEnrolling(false); setQrCode(''); setSecret(''); setVerifyCode('') }}
              className="w-full text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Security Tips */}
      <div className="mt-8 bg-blue-50 rounded-2xl p-6 border border-blue-100">
        <h3 className="font-semibold text-blue-900 mb-2">Security Recommendations</h3>
        <ul className="text-sm text-blue-800 space-y-2">
          <li className="flex items-start gap-2">
            <span className="mt-0.5">&#8226;</span>
            Enable 2FA to protect your account from unauthorized access.
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5">&#8226;</span>
            Use a strong, unique password (at least 8 characters with mixed case and numbers).
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5">&#8226;</span>
            Save your authenticator app backup codes in a secure location.
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5">&#8226;</span>
            Never share your login credentials or 2FA codes with anyone.
          </li>
        </ul>
      </div>
    </div>
  )
}
