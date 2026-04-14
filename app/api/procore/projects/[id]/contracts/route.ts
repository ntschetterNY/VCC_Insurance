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
    // Fetch commitments (subcontracts & purchase orders) for this project
    const res = await fetch(
      `https://api.procore.com/rest/v1.0/projects/${encodeURIComponent(projectId)}/commitments`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Procore-Company-Id': companyId,
        },
      }
    )

    if (!res.ok) {
      const body = await res.text()
      console.error(`Procore commitments API error for project ${projectId}: ${res.status} ${body}`)
      return NextResponse.json({ error: `Procore API error: ${res.status} ${body}` }, { status: res.status })
    }

    const commitments = await res.json() as Array<{
      id: number
      title: string
      number?: string
      vendor?: { id: number; name: string }
      status?: string
      commitment_type?: string
    }>

    return NextResponse.json(commitments.map((c) => ({
      id: c.id,
      title: c.title,
      number: c.number ?? '',
      vendor: c.vendor?.name ?? '',
      status: c.status ?? '',
    })))
  } catch (err) {
    console.error('Procore commitments error:', err)
    return NextResponse.json({ error: 'Failed to fetch Procore commitments' }, { status: 500 })
  }
}
