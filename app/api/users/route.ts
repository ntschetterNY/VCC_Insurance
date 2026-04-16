import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'
import { sanitizeString, isValidEmail } from '@/lib/security'
import crypto from 'crypto'

export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Use admin client to bypass RLS
  const adminClient = createSupabaseAdmin()
  const { data, error } = await adminClient
    .from('users')
    .select('id, email, name, role, status, must_change_password, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

/**
 * POST /api/users
 * Body: {
 *   email, name, role,
 *   password?: string,
 *   must_change_password?: boolean,    // force reset on first login
 *   generate_password?: boolean        // generate a random temp password
 * }
 *
 * If `generate_password` is true (or no password is supplied) we create a
 * random 12-char temporary password and automatically set
 * must_change_password = true; the response includes the temp password so
 * the admin can share it with the new user.
 */
export async function POST(req: NextRequest) {
  const adminUser = await requireAdmin()
  if (!adminUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json() as {
    email: string
    name: string
    password?: string
    role: string
    must_change_password?: boolean
    generate_password?: boolean
  }

  const email = sanitizeString(body.email ?? '').toLowerCase()
  const name = sanitizeString(body.name ?? '')
  const role = body.role as 'admin' | 'reviewer'

  if (!email || !name) {
    return NextResponse.json({ error: 'Email and name are required' }, { status: 400 })
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
  }
  if (!['admin', 'reviewer'].includes(role)) {
    return NextResponse.json({ error: 'Role must be admin or reviewer' }, { status: 400 })
  }

  const generate = body.generate_password === true || !body.password
  const password = generate ? generateTempPassword() : (body.password ?? '')
  const mustChange = body.must_change_password === true || generate

  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  const admin = createSupabaseAdmin()

  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (authErr || !created?.user) {
    return NextResponse.json({ error: authErr?.message ?? 'Failed to create auth user' }, { status: 409 })
  }

  const { error: profileErr } = await admin.from('users').insert({
    id: created.user.id,
    email,
    name,
    role,
    status: 'active',
    must_change_password: mustChange,
    created_by: adminUser.id,
  })
  if (profileErr) {
    await admin.auth.admin.deleteUser(created.user.id)
    return NextResponse.json({ error: profileErr.message }, { status: 500 })
  }

  return NextResponse.json({
    id: created.user.id,
    email,
    must_change_password: mustChange,
    temp_password: generate ? password : undefined,
  }, { status: 201 })
}

function generateTempPassword() {
  const bytes = crypto.randomBytes(9).toString('base64url')
  return `Tmp-${bytes}`
}
