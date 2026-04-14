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
    // List commitments for this project — uses the same top-level
    // /commitments resource referenced by the export route
    // (/commitments/{id}/attachments), filtered by project_id.
    const url = `https://api.procore.com/rest/v1.0/commitments?project_id=${encodeURIComponent(projectId)}`

    console.log(`[Procore] Fetching commitments: ${url}`)

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Procore-Company-Id': companyId,
      },
    })

    if (!res.ok) {
      const body = await res.text()
      console.error(`[Procore] Commitments API error for project ${projectId}: ${res.status} ${body}`)
      return NextResponse.json({ error: `Procore API error: ${res.status} ${body}` }, { status: res.status })
    }

    const raw = await res.json()
    console.log(`[Procore] Commitments response (first 500 chars): ${JSON.stringify(raw).slice(0, 500)}`)

    // Normalise — the API may return an array or a wrapper with an array
    const commitments: Array<{
      id: number
      title?: string
      description?: string
      number?: string
      vendor?: { id: number; name: string }
      status?: string
      commitment_type?: string
    }> = Array.isArray(raw) ? raw : (raw?.data ?? raw?.commitments ?? [])

    return NextResponse.json(commitments.map((c) => ({
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
