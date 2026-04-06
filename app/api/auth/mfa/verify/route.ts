import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

/**
 * POST /api/auth/mfa/verify
 * Verifies a TOTP code to complete 2FA challenge or finalize enrollment.
 * Body: { factor_id: string, code: string }
 */
export async function POST(req: NextRequest) {
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

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { factor_id, code } = await req.json() as { factor_id: string; code: string }
  if (!factor_id || !code) {
    return NextResponse.json({ error: 'factor_id and code are required' }, { status: 400 })
  }

  const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
    factorId: factor_id,
  })

  if (challengeError) {
    return NextResponse.json({ error: challengeError.message }, { status: 400 })
  }

  const { data, error } = await supabase.auth.mfa.verify({
    factorId: factor_id,
    challengeId: challengeData.id,
    code,
  })

  if (error) {
    return NextResponse.json({ error: 'Invalid verification code' }, { status: 400 })
  }

  const res = NextResponse.json({ success: true, session: data })
  for (const c of cookiesToSet) {
    res.cookies.set(c.name, c.value, c.options)
  }
  return res
}
