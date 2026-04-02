import { NextRequest, NextResponse } from 'next/server'
import getDb from '@/lib/db'
import { requireAuth } from '@/lib/auth'

function getProcoreSettings(db: ReturnType<typeof getDb>) {
  const rows = db.prepare('SELECT key, value FROM settings WHERE key LIKE ?').all('procore_%') as Array<{ key: string; value: string }>
  const settings: Record<string, string> = {}
  rows.forEach((r) => { settings[r.key] = r.value })
  return {
    accessToken: settings['procore_access_token'] ?? '',
    companyId: settings['procore_company_id'] ?? '',
  }
}

// GET /api/procore/projects - list all projects for the configured company
export async function GET(req: NextRequest) {
  const user = requireAuth(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = getDb()
  const { accessToken, companyId } = getProcoreSettings(db)

  if (!accessToken || !companyId) {
    return NextResponse.json({ error: 'Procore not configured. Add your credentials in Settings.' }, { status: 400 })
  }

  try {
    const res = await fetch(
      `https://api.procore.com/rest/v1.0/projects?company_id=${companyId}`,
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
