import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'

/**
 * POST /api/auth/mfa/unenroll
 * Removes a TOTP factor from the current user's account.
 * Body: { factor_id: string }
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { factor_id } = await req.json() as { factor_id: string }
  if (!factor_id) {
    return NextResponse.json({ error: 'factor_id is required' }, { status: 400 })
  }

  const { error } = await supabase.auth.mfa.unenroll({ factorId: factor_id })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
