import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getValidAccessToken } from '@/app/api/procore/route'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tokenResult = await getValidAccessToken()
  if ('error' in tokenResult) {
    return NextResponse.json({ error: tokenResult.error }, { status: 400 })
  }

  const { token, companyId } = tokenResult
  const projectId = params.id

  try {
    // REST v2.0 commitment_contracts endpoint (matches working Power Query)
    const url =
      `https://api.procore.com/rest/v2.0/companies/${encodeURIComponent(companyId)}` +
      `/projects/${encodeURIComponent(projectId)}` +
      `/commitment_contracts?page=1&per_page=100`

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Procore-Company-Id': companyId,
        Accept: 'application/json',
      },
    })

    if (!res.ok) {
      const body = await res.text()
      console.error(`[Procore] commitment_contracts error for project ${projectId}: ${res.status} ${body}`)
      return NextResponse.json({ error: `Procore API error: ${res.status} ${body}` }, { status: res.status })
    }

    const raw = await res.json()

    // v2.0 wraps results in { data: [...] }
    const items: Array<{
      id: number
      title?: string
      description?: string
      number?: string
      status?: string
      type?: string
      vendor?: { id: number; name?: string }
      grand_total?: string
    }> = raw.data ?? raw ?? []

    return NextResponse.json(items.map((c) => ({
      id: c.id,
      title: c.title ?? c.description ?? `Commitment #${c.id}`,
      number: c.number ?? '',
      vendor: c.vendor?.name ?? '',
      status: c.status ?? '',
    })))
  } catch (err) {
    console.error('Procore commitments error:', err)
    return NextResponse.json({ error: 'Failed to fetch Procore commitments' }, { status: 500 })
  }
}
