import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getValidAccessToken } from '@/app/api/procore/route'

export async function GET() {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tokenResult = await getValidAccessToken()
  if ('error' in tokenResult) {
    return NextResponse.json({ error: tokenResult.error }, { status: 400 })
  }

  const { token, companyId } = tokenResult

  try {
    const res = await fetch(
      `https://api.procore.com/rest/v1.0/projects?company_id=${encodeURIComponent(companyId)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
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
