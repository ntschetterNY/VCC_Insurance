import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'
import { requireAdmin, createUser } from '@/lib/auth'
import { sanitizeString, isValidEmail } from '@/lib/security'

export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Use admin client to bypass RLS
  const adminClient = createSupabaseAdmin()
  const { data, error } = await adminClient
    .from('users')
    .select('id, email, name, role, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json() as {
    email: string; name: string; password: string; role: string
  }

  const email = sanitizeString(body.email ?? '').toLowerCase()
  const name = sanitizeString(body.name ?? '')
  const password = body.password ?? ''
  const role = body.role as 'admin' | 'reviewer'

  if (!email || !name || !password) {
    return NextResponse.json({ error: 'Email, name, and password are required' }, { status: 400 })
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
  }
  if (!['admin', 'reviewer'].includes(role)) {
    return NextResponse.json({ error: 'Role must be admin or reviewer' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  const result = await createUser(email, password, name, role)
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 409 })
  }
  return NextResponse.json({ id: result.id }, { status: 201 })
}
