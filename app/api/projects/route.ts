import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createSupabaseAdmin } from '@/lib/supabase'
import { sanitizeString } from '@/lib/security'

export async function GET() {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from('projects')
    .select('*')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    name: string
    procore_project_id?: string
    address?: string
  }

  const name = sanitizeString(body.name ?? '')
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const admin = createSupabaseAdmin()
  const { data, error } = await admin
    .from('projects')
    .insert({
      name,
      procore_project_id: body.procore_project_id ? sanitizeString(body.procore_project_id) : null,
      address: body.address ? sanitizeString(body.address) : null,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
