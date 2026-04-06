import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
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

    // We must track cookies on the response object directly so they
    // are sent back to the browser alongside our JSON body.
    const res = NextResponse.json({})
    const cookiesToSet: { name: string; value: string; options: CookieOptions }[] = []

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return req.cookies.get(name)?.value
          },
          set(name: string, value: string, options: CookieOptions) {
            cookiesToSet.push({ name, value, options })
          },
          remove(name: string, options: CookieOptions) {
            cookiesToSet.push({ name, value: '', options: { ...options, maxAge: 0 } })
          },
        },
      }
    )

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    // Check if MFA is required
    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aalData && aalData.nextLevel === 'aal2' && aalData.currentLevel === 'aal1') {
      const { data: factorsData } = await supabase.auth.mfa.listFactors()
      const totpFactor = factorsData?.totp?.[0]

      // Still set cookies so the aal1 session is persisted for the MFA step
      const mfaRes = NextResponse.json({
        mfa_required: true,
        factor_id: totpFactor?.id,
        user: { id: data.user.id, email: data.user.email },
      })
      for (const c of cookiesToSet) {
        mfaRes.cookies.set(c.name, c.value, c.options)
      }
      return mfaRes
    }

    // Fetch profile
    const { data: profile } = await supabase
      .from('users')
      .select('name, role')
      .eq('id', data.user.id)
      .single()

    const successRes = NextResponse.json({
      user: {
        id: data.user.id,
        email: data.user.email,
        name: profile?.name ?? data.user.email?.split('@')[0],
        role: profile?.role ?? 'reviewer',
      },
    })

    // Apply all cookies Supabase set during signIn to the response
    for (const c of cookiesToSet) {
      successRes.cookies.set(c.name, c.value, c.options)
    }

    return successRes
  } catch (err) {
    console.error('Login error:', err)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
