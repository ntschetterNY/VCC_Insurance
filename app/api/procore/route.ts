import { NextRequest, NextResponse } from 'next/server'
import getDb from '@/lib/db'
import { requireAdmin, requireAuth } from '@/lib/auth'

// GET - retrieve Procore settings (token masked for non-admins)
export async function GET(req: NextRequest) {
  const user = requireAuth(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = getDb()
  const rows = db.prepare('SELECT key, value FROM settings WHERE key LIKE ?').all('procore_%') as Array<{ key: string; value: string }>
  const settings: Record<string, string> = {}
  rows.forEach((r) => { settings[r.key] = r.value })

  const isAdmin = user.role === 'admin'
  return NextResponse.json({
    client_id: settings['procore_client_id'] ?? '',
    company_id: settings['procore_company_id'] ?? '',
    // Mask access token for non-admins
    access_token: isAdmin
      ? (settings['procore_access_token'] ?? '')
      : (settings['procore_access_token'] ? '••••••••' : ''),
    configured: !!(settings['procore_access_token'] && settings['procore_company_id']),
  })
}

// PUT - save Procore settings (admin only)
export async function PUT(req: NextRequest) {
  const admin = requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json() as { client_id?: string; company_id?: string; access_token?: string }
  const db = getDb()

  const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')

  if (body.client_id !== undefined) upsert.run('procore_client_id', body.client_id)
  if (body.company_id !== undefined) upsert.run('procore_company_id', body.company_id)
  if (body.access_token !== undefined && body.access_token !== '••••••••') {
    upsert.run('procore_access_token', body.access_token)
  }

  return NextResponse.json({ success: true })
}
