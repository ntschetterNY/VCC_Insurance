import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createSupabaseAdmin } from '@/lib/supabase'

/**
 * POST /api/auth/setup
 * First-time setup: if no admin users exist in public.users,
 * the currently logged-in user can claim the admin role.
 */
export async function POST(req: NextRequest) {
  try {
    const adminClient = createSupabaseAdmin()

    // Check if any admin users exist already
    const { count: adminCount, error: countError } = await adminClient
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'admin')

    if (countError) {
      return NextResponse.json({ error: `DB error: ${countError.message}` }, { status: 500 })
    }

    if (adminCount && adminCount > 0) {
      return NextResponse.json(
        { error: 'Setup already completed. An admin user already exists.' },
        { status: 403 }
      )
    }

    // Get the current user from cookies
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) { return req.cookies.get(name)?.value },
          set() {},
          remove() {},
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()

    // If we can get the user from session, use that
    if (user) {
      // Check if profile exists
      const { data: existing } = await adminClient
        .from('users')
        .select('id')
        .eq('id', user.id)
        .single()

      if (existing) {
        const { error } = await adminClient.from('users').update({ role: 'admin' }).eq('id', user.id)
        if (error) return NextResponse.json({ error: `Update failed: ${error.message}` }, { status: 500 })
      } else {
        const { error } = await adminClient.from('users').insert({
          id: user.id,
          email: user.email,
          name: user.email?.split('@')[0] ?? 'Admin',
          role: 'admin',
        })
        if (error) return NextResponse.json({ error: `Insert failed: ${error.message}` }, { status: 500 })
      }

      return NextResponse.json({ success: true, user: { id: user.id, email: user.email, role: 'admin' } })
    }

    // Fallback: if session can't be read, try finding the user by listing auth users
    // and promoting the first one (only works when no admin exists)
    const { data: authUsers } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1 })
    const firstUser = authUsers?.users?.[0]

    if (!firstUser) {
      return NextResponse.json({ error: 'No authenticated users found' }, { status: 400 })
    }

    // Check if profile exists
    const { data: existing } = await adminClient
      .from('users')
      .select('id')
      .eq('id', firstUser.id)
      .single()

    if (existing) {
      const { error } = await adminClient.from('users').update({ role: 'admin' }).eq('id', firstUser.id)
      if (error) return NextResponse.json({ error: `Update failed: ${error.message}` }, { status: 500 })
    } else {
      const { error } = await adminClient.from('users').insert({
        id: firstUser.id,
        email: firstUser.email,
        name: firstUser.email?.split('@')[0] ?? 'Admin',
        role: 'admin',
      })
      if (error) return NextResponse.json({ error: `Insert failed: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      user: { id: firstUser.id, email: firstUser.email, role: 'admin' },
    })
  } catch (err) {
    console.error('Setup error:', err)
    return NextResponse.json(
      { error: `Setup exception: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }
}

/**
 * GET /api/auth/setup
 * Check if first-time setup is needed (no admin users exist).
 */
export async function GET() {
  try {
    const adminClient = createSupabaseAdmin()
    const { count, error } = await adminClient
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'admin')

    if (error) {
      return NextResponse.json({ setup_required: true, error: error.message })
    }

    return NextResponse.json({ setup_required: !count || count === 0 })
  } catch (err) {
    return NextResponse.json({
      setup_required: true,
      error: err instanceof Error ? err.message : 'Unknown error',
    })
  }
}
