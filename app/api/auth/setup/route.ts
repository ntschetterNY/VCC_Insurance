import { NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseAdmin } from '@/lib/supabase'

/**
 * POST /api/auth/setup
 * First-time setup: if no admin users exist in public.users,
 * the currently logged-in user can claim the admin role.
 * Works for both new users and existing users with 'reviewer' role.
 */
export async function POST() {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'You must be logged in' }, { status: 401 })
    }

    const adminClient = createSupabaseAdmin()

    // Check if any admin users exist
    const { count: adminCount } = await adminClient
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'admin')

    if (adminCount && adminCount > 0) {
      return NextResponse.json(
        { error: 'Setup already completed. An admin user already exists.' },
        { status: 403 }
      )
    }

    // Check if this user already has a profile row
    const { data: existingProfile } = await adminClient
      .from('users')
      .select('id, role')
      .eq('id', user.id)
      .single()

    if (existingProfile) {
      // Promote existing user to admin
      const { error: updateError } = await adminClient
        .from('users')
        .update({ role: 'admin' })
        .eq('id', user.id)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }
    } else {
      // Create new admin profile
      const { error: insertError } = await adminClient.from('users').insert({
        id: user.id,
        email: user.email,
        name: user.email?.split('@')[0] ?? 'Admin',
        role: 'admin',
      })

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      user: { id: user.id, email: user.email, role: 'admin' },
    })
  } catch (err) {
    console.error('Setup error:', err)
    return NextResponse.json({ error: 'Setup failed' }, { status: 500 })
  }
}

/**
 * GET /api/auth/setup
 * Check if first-time setup is needed (no admin users exist).
 */
export async function GET() {
  try {
    const adminClient = createSupabaseAdmin()
    const { count } = await adminClient
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'admin')

    return NextResponse.json({ setup_required: !count || count === 0 })
  } catch {
    return NextResponse.json({ setup_required: false })
  }
}
