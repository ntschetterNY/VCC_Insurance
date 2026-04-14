import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireAdmin } from '@/lib/auth'
import { createSupabaseAdmin } from '@/lib/supabase'
import { encryptField, decryptField } from '@/lib/security'

// ---------------------------------------------------------------------------
// Helper: get Procore settings from DB
// ---------------------------------------------------------------------------
async function getProcoreSettings() {
  const admin = createSupabaseAdmin()
  const { data: rows } = await admin
    .from('settings')
    .select('key, value')
    .like('key', 'procore_%')

  const settings: Record<string, string> = {}
  ;(rows ?? []).forEach((r: { key: string; value: string }) => { settings[r.key] = r.value })
  return settings
}

// ---------------------------------------------------------------------------
// Helper: fetch access token using Client Credentials OAuth flow
// ---------------------------------------------------------------------------
async function fetchAccessToken(clientId: string, clientSecret: string): Promise<{
  access_token: string
  expires_in: number
  error?: string
}> {
  const res = await fetch('https://login.procore.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })

  if (!res.ok) {
    const errBody = await res.text()
    return { access_token: '', expires_in: 0, error: `Procore OAuth error ${res.status}: ${errBody}` }
  }

  const data = await res.json() as { access_token: string; expires_in: number }
  return data
}

// ---------------------------------------------------------------------------
// Helper: get a valid access token (auto-refresh if expired)
// ---------------------------------------------------------------------------
export async function getValidAccessToken(): Promise<{ token: string; companyId: string } | { error: string }> {
  const settings = await getProcoreSettings()

  const clientId = settings['procore_client_id'] ?? ''
  let clientSecret = settings['procore_client_secret'] ?? ''
  const companyId = settings['procore_company_id'] ?? ''

  if (!clientId || !clientSecret || !companyId) {
    return { error: 'Procore not configured. Add Client ID, Client Secret, and Company ID in Settings.' }
  }

  // Decrypt the client secret
  try { clientSecret = decryptField(clientSecret) } catch { /* use raw */ }

  // Check if we have a cached token that's still valid
  let cachedToken = settings['procore_access_token'] ?? ''
  const tokenExpiry = settings['procore_token_expiry'] ?? ''

  if (cachedToken && tokenExpiry) {
    try { cachedToken = decryptField(cachedToken) } catch { /* use raw */ }
    const expiresAt = new Date(tokenExpiry).getTime()
    // Refresh 5 minutes before expiry
    if (Date.now() < expiresAt - 5 * 60 * 1000) {
      return { token: cachedToken, companyId }
    }
  }

  // Fetch new token
  const result = await fetchAccessToken(clientId, clientSecret)
  if (result.error) {
    return { error: result.error }
  }

  // Cache the new token
  const admin = createSupabaseAdmin()
  const encryptedToken = encryptField(result.access_token)
  const expiry = new Date(Date.now() + result.expires_in * 1000).toISOString()

  await admin.from('settings').upsert({ key: 'procore_access_token', value: encryptedToken })
  await admin.from('settings').upsert({ key: 'procore_token_expiry', value: expiry })

  return { token: result.access_token, companyId }
}

// ---------------------------------------------------------------------------
// GET - retrieve Procore settings (secrets masked for non-admins)
// ---------------------------------------------------------------------------
export async function GET() {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await getProcoreSettings()
  const isAdmin = user.role === 'admin'

  return NextResponse.json({
    client_id: settings['procore_client_id'] ?? '',
    client_secret: isAdmin
      ? (settings['procore_client_secret'] ? '••••••••' : '')
      : '••••••••',
    company_id: settings['procore_company_id'] ?? '',
    configured: !!(settings['procore_client_id'] && settings['procore_client_secret'] && settings['procore_company_id']),
    token_cached: !!(settings['procore_access_token']),
    token_expiry: settings['procore_token_expiry'] ?? null,
  })
}

// ---------------------------------------------------------------------------
// PUT - save Procore settings (admin only)
// ---------------------------------------------------------------------------
export async function PUT(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json() as {
    client_id?: string
    client_secret?: string
    company_id?: string
  }

  const adminClient = createSupabaseAdmin()

  if (body.client_id !== undefined) {
    await adminClient.from('settings').upsert({ key: 'procore_client_id', value: body.client_id })
  }
  if (body.company_id !== undefined) {
    await adminClient.from('settings').upsert({ key: 'procore_company_id', value: body.company_id })
  }
  if (body.client_secret !== undefined && body.client_secret !== '••••••••') {
    const encrypted = encryptField(body.client_secret)
    await adminClient.from('settings').upsert({ key: 'procore_client_secret', value: encrypted })
    // Clear cached token so it gets refreshed with new credentials
    await adminClient.from('settings').delete().eq('key', 'procore_access_token')
    await adminClient.from('settings').delete().eq('key', 'procore_token_expiry')
  }

  return NextResponse.json({ success: true })
}

// ---------------------------------------------------------------------------
// POST - test connection (fetches a new token and verifies)
// ---------------------------------------------------------------------------
export async function POST() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const result = await getValidAccessToken()
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  // Test the token by fetching company info
  try {
    const res = await fetch(
      `https://api.procore.com/rest/v1.0/companies/${result.companyId}`,
      {
        headers: {
          Authorization: `Bearer ${result.token}`,
          'Procore-Company-Id': result.companyId,
        },
      }
    )

    if (!res.ok) {
      const errBody = await res.text()
      return NextResponse.json({ error: `Procore API test failed: ${res.status} ${errBody}` }, { status: res.status })
    }

    const company = await res.json() as { name: string }
    return NextResponse.json({ success: true, company_name: company.name })
  } catch (err) {
    return NextResponse.json({ error: `Connection test failed: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 })
  }
}
