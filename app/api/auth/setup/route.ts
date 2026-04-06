import { NextResponse } from 'next/server'
import { createSupabaseServerClient, createSupabaseAdmin } from '@/lib/supabase'

/**
 * POST /api/auth/setup
 * First-time setup: if no users exist in the public.users table,
 * the currently logged-in Supabase Auth user can claim the admin role.
 * This only works once — after the first admin is created, this endpoint
 * returns 403.
 */
export async function POST() {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'You must be logged in' }, { status: 401 })
    }

    // Check if any users exist in the public.users table
    const adminClient = createSupabaseAdmin()
    const { count, error: countError } = await adminClient
      .from('users')
      .select('*', { count: 'exact', head: true })

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 })
    }

    if (count && count > 0) {
      return NextResponse.json(
        { error: 'Setup already completed. An admin user already exists.' },
        { status: 403 }
      )
    }

    // Create the admin profile for the current auth user
    const { error: insertError } = await adminClient.from('users').insert({
      id: user.id,
      email: user.email,
      name: user.email?.split('@')[0] ?? 'Admin',
      role: 'admin',
    })

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
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
 * Check if first-time setup is needed.
 */
export async function GET() {
  try {
    const adminClient = createSupabaseAdmin()
    const { count } = await adminClient
      .from('users')
      .select('*', { count: 'exact', head: true })

    return NextResponse.json({ setup_required: !count || count === 0 })
  } catch {
    return NextResponse.json({ setup_required: false })
  }
}
