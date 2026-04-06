import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { requireAuth, requireAdmin } from '@/lib/auth'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const supabase = await getDb()
    const id = parseInt(params.id)

    const { data: submission, error } = await supabase
      .from('submissions')
      .select(`
        *,
        subcontractors ( name, trade, tier ),
        assigned_user:users!submissions_assigned_to_fkey ( name )
      `)
      .eq('id', id)
      .single()

    if (error || !submission) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data: documents } = await supabase
      .from('documents')
      .select('id, submission_id, doc_type, filename, processed_at')
      .eq('submission_id', id)

    const { data: analysis } = await supabase
      .from('ai_analysis')
      .select('*')
      .eq('submission_id', id)
      .single()

    const { data: flags } = await supabase
      .from('reviewer_flags')
      .select('*')
      .eq('submission_id', id)
      .order('created_at', { ascending: false })

    const sub = submission.subcontractors as Record<string, unknown> | null
    const trade = sub?.trade as string | undefined

    let schedule = null
    if (trade) {
      const { data } = await supabase
        .from('schedule')
        .select('*')
        .eq('trade', trade)
        .single()
      schedule = data
    }

    const { data: allUsers } = await supabase
      .from('users')
      .select('id, name, role')
      .order('name')

    return NextResponse.json({
      ...submission,
      sub_name: sub?.name ?? '',
      trade: sub?.trade ?? '',
      tier: sub?.tier ?? '',
      assigned_user_name: (submission.assigned_user as Record<string, unknown> | null)?.name ?? null,
      documents: documents ?? [],
      ai_analysis: analysis ?? null,
      reviewer_flags: flags ?? [],
      schedule,
      available_reviewers: allUsers ?? [],
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to fetch submission' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const supabase = await getDb()
    const id = parseInt(params.id)
    const body = await req.json() as { status?: string; reviewer_notes?: string; assigned_to?: string | null }

    const updates: Record<string, unknown> = {}
    if (body.status) {
      updates.status = body.status
      if (body.status === 'approved' || body.status === 'rejected') {
        updates.reviewed_at = new Date().toISOString()
      }
    }
    if (body.reviewer_notes !== undefined) updates.reviewer_notes = body.reviewer_notes
    if (body.assigned_to !== undefined) updates.assigned_to = body.assigned_to

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const { error } = await supabase.from('submissions').update(updates).eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to update submission' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })

  try {
    const supabase = await getDb()
    const id = parseInt(params.id)

    // Delete associated documents from Supabase storage
    const { data: documents } = await supabase
      .from('documents')
      .select('storage_path')
      .eq('submission_id', id)

    // Delete DB records (cascade should handle children, but be explicit)
    await supabase.from('reviewer_flags').delete().eq('submission_id', id)
    await supabase.from('ai_analysis').delete().eq('submission_id', id)
    await supabase.from('documents').delete().eq('submission_id', id)
    await supabase.from('submissions').delete().eq('id', id)

    // Remove files from storage bucket
    if (documents && documents.length > 0) {
      const paths = documents
        .map((d: Record<string, unknown>) => d.storage_path as string)
        .filter(Boolean)
      if (paths.length > 0) {
        await supabase.storage.from('documents').remove(paths)
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to delete submission' }, { status: 500 })
  }
}
