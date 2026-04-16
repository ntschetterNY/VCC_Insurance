import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createSupabaseAdmin } from '@/lib/supabase'

// GET — list sent/drafted emails, optionally filtered by submission
export async function GET(req: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const submissionId = searchParams.get('submission_id')
  const status = searchParams.get('status')

  const admin = createSupabaseAdmin()
  let query = admin
    .from('email_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  if (submissionId) query = query.eq('submission_id', parseInt(submissionId))
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}
