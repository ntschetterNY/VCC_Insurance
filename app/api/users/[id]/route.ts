import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { requireAdmin, deleteUser } from '@/lib/auth'
import { createSupabaseAdmin } from '@/lib/supabase'

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const targetId = params.id
  if (targetId === admin.id) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
  }

  await deleteUser(targetId)
  return NextResponse.json({ success: true })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { name, password, role } = await req.json() as {
    name?: string; password?: string; role?: string
  }
  const supabase = await getDb()
  const targetId = params.id

  const updates: Record<string, unknown> = {}
  if (name) updates.name = name.trim()
  if (role && ['admin', 'reviewer'].includes(role)) updates.role = role

  if (Object.keys(updates).length > 0) {
    await supabase.from('users').update(updates).eq('id', targetId)
  }

  // Update auth password via admin API
  if (password) {
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }
    const adminClient = createSupabaseAdmin()
    const { error } = await adminClient.auth.admin.updateUserById(targetId, { password })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
