import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'

/**
 * POST /api/auth/mfa/enroll
 * Enrolls a new TOTP factor for the logged-in user.
 * Returns QR code URI and secret for authenticator app setup.
 */
export async function POST() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'VCC Insurance Authenticator',
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({
    factor_id: data.id,
    qr_code: data.totp.qr_code,  // data URI for QR code image
    secret: data.totp.secret,      // manual entry secret
    uri: data.totp.uri,            // otpauth:// URI
  })
}
