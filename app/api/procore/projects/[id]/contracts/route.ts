import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { decryptField } from '@/lib/security'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
  const companyId = settings['procore_company_id'] ?? ''

  if (!accessToken || !companyId) {
    return NextResponse.json({ error: 'Procore not configured' }, { status: 400 })
  }

  const projectId = params.id

  try {
    const res = await fetch(
      `https://api.procore.com/rest/v1.0/commitments/contracts?project_id=${encodeURIComponent(projectId)}`,
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
