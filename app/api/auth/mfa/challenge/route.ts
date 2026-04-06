import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'

/**
 * POST /api/auth/mfa/challenge
 * Creates a challenge for a given TOTP factor (used during login 2FA step).
 * Body: { factor_id: string }
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()

  const { factor_id } = await req.json() as { factor_id: string }
  if (!factor_id) {
    return NextResponse.json({ error: 'factor_id is required' }, { status: 400 })
  }

  const { data, error } = await supabase.auth.mfa.challenge({ factorId: factor_id })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ challenge_id: data.id })
}
