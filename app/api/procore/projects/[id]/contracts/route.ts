import { NextRequest, NextResponse } from 'next/server'
import getDb from '@/lib/db'
import { requireAuth } from '@/lib/auth'

// GET /api/procore/projects/[id]/contracts - list subcontracts for a project
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = requireAuth(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = getDb()
  const rows = db.prepare('SELECT key, value FROM settings WHERE key LIKE ?').all('procore_%') as Array<{ key: string; value: string }>
  const settings: Record<string, string> = {}
  rows.forEach((r) => { settings[r.key] = r.value })

  const accessToken = settings['procore_access_token'] ?? ''
  const companyId = settings['procore_company_id'] ?? ''

  if (!accessToken || !companyId) {
    return NextResponse.json({ error: 'Procore not configured' }, { status: 400 })
  }

  const projectId = params.id

  try {
    // Fetch subcontracts (commitments) for the project
    const res = await fetch(
      `https://api.procore.com/rest/v1.0/commitments/contracts?project_id=${projectId}`,
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

    const contracts = await res.json() as Array<{
      id: number
      title: string
      number?: string
      vendor?: { name: string }
      status?: string
    }>

    return NextResponse.json(contracts.map((c) => ({
      id: c.id,
      title: c.title,
      number: c.number ?? '',
      vendor: c.vendor?.name ?? '',
      status: c.status ?? '',
    })))
  } catch (err) {
    console.error('Procore contracts error:', err)
    return NextResponse.json({ error: 'Failed to fetch Procore contracts' }, { status: 500 })
  }
}
