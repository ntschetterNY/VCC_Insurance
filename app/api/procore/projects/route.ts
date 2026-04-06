import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { decryptField } from '@/lib/security'

async function getProcoreSettings() {
  const supabase = await getDb()
  const { data: rows } = await supabase
    .from('settings')
    .select('key, value')
    .like('key', 'procore_%')

  const settings: Record<string, string> = {}
  ;(rows ?? []).forEach((r: { key: string; value: string }) => { settings[r.key] = r.value })

  let accessToken = settings['procore_access_token'] ?? ''
  if (accessToken) {
    try { accessToken = decryptField(accessToken) } catch { /* use raw */ }
  }

  return {
    accessToken,
    companyId: settings['procore_company_id'] ?? '',
  }
}

export async function GET() {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { accessToken, companyId } = await getProcoreSettings()

  if (!accessToken || !companyId) {
    return NextResponse.json({ error: 'Procore not configured. Add your credentials in Settings.' }, { status: 400 })
  }

  try {
    const res = await fetch(
      `https://api.procore.com/rest/v1.0/projects?company_id=${encodeURIComponent(companyId)}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Procore-Company-Id': companyId,
        },
      }
    )

    if (!res.ok) {
      const body = await res.text()
      return NextResponse.json({ error: `Procore API error: ${res.status} ${body}` }, { status: res.status })
    }

    const projects = await res.json() as Array<{ id: number; name: string; display_name?: string }>
    return NextResponse.json(projects.map((p) => ({
      id: p.id,
      name: p.display_name ?? p.name,
    })))
  } catch (err) {
    console.error('Procore projects error:', err)
    return NextResponse.json({ error: 'Failed to fetch Procore projects' }, { status: 500 })
  }
}
