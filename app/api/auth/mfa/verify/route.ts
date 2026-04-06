import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'

/**
 * POST /api/auth/mfa/verify
 * Verifies a TOTP code to complete 2FA challenge or finalize enrollment.
 * Body: { factor_id: string, code: string }
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { factor_id, code } = await req.json() as { factor_id: string; code: string }
  if (!factor_id || !code) {
    return NextResponse.json({ error: 'factor_id and code are required' }, { status: 400 })
  }

  // Create a challenge first
  const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
    factorId: factor_id,
  })

  if (challengeError) {
    return NextResponse.json({ error: challengeError.message }, { status: 400 })
  }

  // Verify the TOTP code against the challenge
  const { data, error } = await supabase.auth.mfa.verify({
    factorId: factor_id,
    challengeId: challengeData.id,
    code,
  })

  if (error) {
    return NextResponse.json({ error: 'Invalid verification code' }, { status: 400 })
  }

  return NextResponse.json({ success: true, session: data })
}
