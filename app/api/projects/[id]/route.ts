import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createSupabaseAdmin } from '@/lib/supabase'
import { sanitizeString } from '@/lib/security'

interface SubmissionLite {
  id: number
  status: string | null
  uploaded_at: string | null
  gl_expiration: string | null
  wc_expiration: string | null
  auto_expiration: string | null
  umbrella_expiration: string | null
  subcontractor_email: string | null
  sub_id: number
  subcontractors: { id: number; name: string; trade: string | null; tier: string | null } | null
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createSupabaseAdmin()
  const id = parseInt(params.id)

  const { data: project } = await admin
    .from('projects')
    .select('*')
    .eq('id', id)
    .single()

  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: subs } = await admin
    .from('submissions')
    .select(`
      id, status, uploaded_at, gl_expiration, wc_expiration,
      auto_expiration, umbrella_expiration, subcontractor_email, sub_id,
      subcontractors ( id, name, trade, tier )
    `)
    .eq('project_id', id)
    .order('uploaded_at', { ascending: false })

  return NextResponse.json({
    ...project,
    submissions: (subs as unknown as SubmissionLite[]) ?? [],
  })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    name?: string
    procore_project_id?: string | null
    address?: string | null
    active?: boolean
  }

  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) updates.name = sanitizeString(body.name)
  if (body.procore_project_id !== undefined) {
    updates.procore_project_id = body.procore_project_id ? sanitizeString(body.procore_project_id) : null
  }
  if (body.address !== undefined) {
    updates.address = body.address ? sanitizeString(body.address) : null
  }
  if (body.active !== undefined) updates.active = body.active

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const { error } = await admin
    .from('projects')
    .update(updates)
    .eq('id', parseInt(params.id))

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
