import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase'
import { rateLimit, sanitizeString, isValidEmail } from '@/lib/security'

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'
    if (!rateLimit(`login:${ip}`, { maxRequests: 5, windowMs: 60_000 })) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again in a minute.' },
        { status: 429 }
      )
    }

    const body = await req.json() as { email?: string; password?: string }
    const email = sanitizeString(body.email ?? '').toLowerCase()
    const password = body.password ?? ''

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }

    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    // Check if MFA is required (user has enrolled TOTP factors)
    // When MFA is enrolled, Supabase returns an aal1 session and the user
    // must complete a second step to reach aal2.
    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aalData && aalData.nextLevel === 'aal2' && aalData.currentLevel === 'aal1') {
      // List the user's TOTP factors so the client can challenge
      const { data: factorsData } = await supabase.auth.mfa.listFactors()
      const totpFactor = factorsData?.totp?.[0]

      return NextResponse.json({
        mfa_required: true,
        factor_id: totpFactor?.id,
        user: {
          id: data.user.id,
          email: data.user.email,
        },
      })
    }

    // Fetch profile
    const { data: profile } = await supabase
      .from('users')
      .select('name, role')
      .eq('id', data.user.id)
      .single()

    return NextResponse.json({
      user: {
        id: data.user.id,
        email: data.user.email,
        name: profile?.name ?? data.user.email?.split('@')[0],
        role: profile?.role ?? 'reviewer',
      },
    })
  } catch (err) {
    console.error('Login error:', err)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
