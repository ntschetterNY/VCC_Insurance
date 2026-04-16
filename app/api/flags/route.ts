import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { createSupabaseAdmin } from '@/lib/supabase'

interface FlagRow {
  id: number
  submission_id: number
  flag_type: string | null
  description: string | null
  severity: string | null
  source: string | null
  check_status: string | null
  is_policy_issue: boolean | null
  needs_collection: boolean | null
  collection_item: string | null
  resolution: string | null
  checked_at: string | null
  checked_by: string | null
  created_at: string | null
  submissions: {
    id: number
    status: string | null
    project_id: number | null
    subcontractors: { name: string; trade: string | null; tier: string | null } | null
  } | null
}

// GET — list flags across the system. Supports ?status=pending and ?submission_id=
export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const submissionId = searchParams.get('submission_id')

  const admin = createSupabaseAdmin()
  let query = admin
    .from('reviewer_flags')
    .select(`
      id, submission_id, flag_type, description, severity, source,
      check_status, is_policy_issue, needs_collection, collection_item,
      resolution, checked_at, checked_by, created_at,
      submissions (
        id, status, project_id,
        subcontractors ( name, trade, tier )
      )
    `)
    .order('created_at', { ascending: false })

  if (status) query = query.eq('check_status', status)
  if (submissionId) query = query.eq('submission_id', parseInt(submissionId))

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const flattened = (data as unknown as FlagRow[] ?? []).map((f) => ({
    id: f.id,
    submission_id: f.submission_id,
    flag_type: f.flag_type,
    description: f.description,
    severity: f.severity,
    source: f.source,
    check_status: f.check_status ?? 'pending',
    is_policy_issue: f.is_policy_issue,
    needs_collection: f.needs_collection ?? false,
    collection_item: f.collection_item,
    resolution: f.resolution,
    checked_at: f.checked_at,
    checked_by: f.checked_by,
    created_at: f.created_at,
    sub_name: f.submissions?.subcontractors?.name ?? '',
    trade: f.submissions?.subcontractors?.trade ?? '',
    tier: f.submissions?.subcontractors?.tier ?? '',
    submission_status: f.submissions?.status ?? null,
    project_id: f.submissions?.project_id ?? null,
  }))

  return NextResponse.json(flattened)
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = await getDb()
    const body = await req.json() as {
      submission_id: number
      flag_type: string
      description: string
      severity: string
      source?: string
    }

    if (!body.submission_id || !body.description) {
      return NextResponse.json({ error: 'submission_id and description are required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('reviewer_flags')
      .insert({
        submission_id: body.submission_id,
        flag_type: body.flag_type || 'general',
        description: body.description,
        severity: body.severity || 'medium',
        source: body.source === 'ai' || body.source === 'system' ? body.source : 'manual',
        check_status: 'pending',
      })
      .select('id')
      .single()

    if (error) throw error
    return NextResponse.json({ id: data.id }, { status: 201 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to create flag' }, { status: 500 })
  }
}
