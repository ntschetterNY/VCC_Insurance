import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { requireAuth, requireAdmin } from '@/lib/auth'
import { encryptField, decryptField } from '@/lib/security'

// GET - retrieve Procore settings (token masked for non-admins)
export async function GET() {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await getDb()
  const { data: rows } = await supabase
    .from('settings')
    .select('key, value')
    .like('key', 'procore_%')

  const settings: Record<string, string> = {}
  ;(rows ?? []).forEach((r: { key: string; value: string }) => { settings[r.key] = r.value })

  // Decrypt access token for display (masked for non-admins)
  let accessToken = ''
  if (settings['procore_access_token']) {
    try {
      accessToken = user.role === 'admin'
        ? decryptField(settings['procore_access_token'])
        : '••••••••'
    } catch {
      accessToken = user.role === 'admin' ? settings['procore_access_token'] : '••••••••'
    }
  }

  return NextResponse.json({
    client_id: settings['procore_client_id'] ?? '',
    company_id: settings['procore_company_id'] ?? '',
    access_token: accessToken,
    configured: !!(settings['procore_access_token'] && settings['procore_company_id']),
  })
}

// PUT - save Procore settings (admin only)
export async function PUT(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json() as { client_id?: string; company_id?: string; access_token?: string }
  const supabase = await getDb()

  if (body.client_id !== undefined) {
    await supabase.from('settings').upsert({ key: 'procore_client_id', value: body.client_id })
  }
  if (body.company_id !== undefined) {
    await supabase.from('settings').upsert({ key: 'procore_company_id', value: body.company_id })
  }
  if (body.access_token !== undefined && body.access_token !== '••••••••') {
    // Encrypt the access token at rest
    const encrypted = encryptField(body.access_token)
    await supabase.from('settings').upsert({ key: 'procore_access_token', value: encrypted })
  }

  return NextResponse.json({ success: true })
}
