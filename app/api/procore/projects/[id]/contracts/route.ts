import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getValidAccessToken } from '@/app/api/procore/route'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let projectId: string
  try {
    projectId = params.id
    console.log(`[Procore] commitments request for project: ${projectId}`)
  } catch (e) {
    console.error('[Procore] Failed to read params:', e)
    return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 })
  }

  const tokenResult = await getValidAccessToken()
  if ('error' in tokenResult) {
    console.error('[Procore] Token error:', tokenResult.error)
    return NextResponse.json({ error: tokenResult.error }, { status: 400 })
  }

  const { token, companyId } = tokenResult
  console.log(`[Procore] companyId="${companyId}" projectId="${projectId}" token length=${token.length}`)

  // REST v2.0 commitment_contracts — matches working Power Query:
  //   /rest/v2.0/companies/{CompanyId}/projects/{ProjectId}/commitment_contracts
  const url =
    `https://api.procore.com/rest/v2.0/companies/${companyId}` +
    `/projects/${projectId}` +
    `/commitment_contracts?page=1&per_page=100`

  console.log(`[Procore] Fetching: ${url}`)

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Procore-Company-Id': companyId,
        Accept: 'application/json',
      },
    })

    console.log(`[Procore] Response status: ${res.status} ${res.statusText}`)

    const bodyText = await res.text()
    console.log(`[Procore] Response body (first 800 chars): ${bodyText.slice(0, 800)}`)

    if (!res.ok) {
      return NextResponse.json(
        { error: `Procore ${res.status}: ${bodyText.slice(0, 300)}` },
        { status: res.status }
      )
    }

    const raw = JSON.parse(bodyText)

    // v2.0 wraps results in { data: [...] }
    const items = Array.isArray(raw) ? raw : (raw?.data ?? [])
    console.log(`[Procore] Parsed ${items.length} commitment(s)`)

    return NextResponse.json(items.map((c: Record<string, unknown>) => ({
      id: c.id,
      title: (c.title as string) ?? (c.description as string) ?? `Commitment #${c.id}`,
      number: (c.number as string) ?? '',
      vendor: (c.vendor as { name?: string })?.name ?? '',
      status: (c.status as string) ?? '',
    })))
  } catch (err) {
    console.error('[Procore] commitments fetch/parse error:', err)
    return NextResponse.json(
      { error: `Commitments request failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }
}
