import { NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'

/**
 * GET /api/auth/force-admin
 * One-time endpoint to force-promote n.tschetter@vorea.com to admin.
 * Uses service role key — no session required.
 * REMOVE THIS ENDPOINT after first admin is set up.
 */
export async function GET() {
  const TARGET_EMAIL = 'n.tschetter@vorea.com'

  try {
    const admin = createSupabaseAdmin()

    // Find the auth user by email
    const { data: authData, error: authError } = await admin.auth.admin.listUsers({ page: 1, perPage: 50 })

    if (authError) {
      return NextResponse.json({ error: `Auth error: ${authError.message}` }, { status: 500 })
    }

    const authUser = authData?.users?.find(u => u.email === TARGET_EMAIL)

    if (!authUser) {
      return NextResponse.json({
        error: `User ${TARGET_EMAIL} not found in Supabase Auth`,
        available_users: authData?.users?.map(u => u.email) ?? [],
      }, { status: 404 })
    }

    // Check if profile row exists
    const { data: existing } = await admin
      .from('users')
      .select('id, role')
      .eq('id', authUser.id)
      .single()

    if (existing) {
      // Update to admin
      const { error } = await admin
        .from('users')
        .update({ role: 'admin' })
        .eq('id', authUser.id)

      if (error) {
        return NextResponse.json({ error: `Update failed: ${error.message}` }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        action: 'promoted',
        user: { id: authUser.id, email: TARGET_EMAIL, role: 'admin' },
      })
    } else {
      // Insert new admin profile
      const { error } = await admin.from('users').insert({
        id: authUser.id,
        email: TARGET_EMAIL,
        name: 'N. Tschetter',
        role: 'admin',
      })

      if (error) {
        return NextResponse.json({ error: `Insert failed: ${error.message}` }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        action: 'created',
        user: { id: authUser.id, email: TARGET_EMAIL, role: 'admin' },
      })
    }
  } catch (err) {
    return NextResponse.json({
      error: `Exception: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 500 })
  }
}
