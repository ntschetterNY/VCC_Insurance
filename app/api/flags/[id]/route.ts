import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createSupabaseAdmin } from '@/lib/supabase'
import { sanitizeString } from '@/lib/security'

const VALID_STATUSES = ['pending', 'reviewed', 'not_an_issue', 'collected', 'waived'] as const

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    check_status?: string
    is_policy_issue?: boolean | null
    needs_collection?: boolean
    collection_item?: string
    resolution?: string
    severity?: string
    description?: string
  }

  const updates: Record<string, unknown> = {}
  if (body.check_status !== undefined) {
    if (!VALID_STATUSES.includes(body.check_status as typeof VALID_STATUSES[number])) {
      return NextResponse.json({ error: 'Invalid check_status' }, { status: 400 })
    }
    updates.check_status = body.check_status
    updates.checked_at = new Date().toISOString()
    updates.checked_by = user.id
  }
  if (body.is_policy_issue !== undefined) updates.is_policy_issue = body.is_policy_issue
  if (body.needs_collection !== undefined) updates.needs_collection = body.needs_collection
  if (body.collection_item !== undefined) {
    updates.collection_item = body.collection_item ? sanitizeString(body.collection_item) : null
  }
  if (body.resolution !== undefined) {
    updates.resolution = body.resolution ? sanitizeString(body.resolution) : null
  }
  if (body.severity !== undefined && ['low', 'medium', 'high'].includes(body.severity)) {
    updates.severity = body.severity
  }
  if (body.description !== undefined) {
    updates.description = sanitizeString(body.description)
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const { error } = await admin
    .from('reviewer_flags')
    .update(updates)
    .eq('id', parseInt(params.id))

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createSupabaseAdmin()
  const { error } = await admin
    .from('reviewer_flags')
    .delete()
    .eq('id', parseInt(params.id))

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
