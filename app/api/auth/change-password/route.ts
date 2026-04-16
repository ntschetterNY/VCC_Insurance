import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createSupabaseAdmin } from '@/lib/supabase'

/**
 * POST /api/auth/change-password
 * Body: { new_password: string }
 *
 * Updates the authenticated user's password via the admin API and clears the
 * must_change_password flag on their profile. Used for the first-login
 * password-reset flow triggered by an admin-created account or an approved
 * registration request.
 */
export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { new_password?: string }
  const password = body.new_password ?? ''

  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const { error: pwErr } = await admin.auth.admin.updateUserById(user.id, { password })
  if (pwErr) return NextResponse.json({ error: pwErr.message }, { status: 500 })

  await admin.from('users').update({ must_change_password: false }).eq('id', user.id)

  return NextResponse.json({ ok: true })
}
