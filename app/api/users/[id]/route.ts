import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, deleteUser } from '@/lib/auth'
import { createSupabaseAdmin } from '@/lib/supabase'

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const targetId = params.id
  if (targetId === admin.id) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
  }

  // Safety: block deleting the last admin
  if (await isLastAdmin(targetId)) {
    return NextResponse.json({ error: 'Cannot delete the only remaining admin' }, { status: 400 })
  }

  await deleteUser(targetId)
  return NextResponse.json({ success: true })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json() as {
    name?: string
    password?: string
    role?: string
    status?: string
    must_change_password?: boolean
  }

  const adminClient = createSupabaseAdmin()
  const targetId = params.id

  // Guard: admin may not demote themselves (they'd lose access immediately)
  if (targetId === admin.id && body.role && body.role !== 'admin') {
    return NextResponse.json({
      error: 'You cannot demote your own admin account. Promote another admin first.',
    }, { status: 400 })
  }

  // Guard: prevent removing the last admin
  if (body.role && body.role !== 'admin' && await isLastAdmin(targetId)) {
    return NextResponse.json({
      error: 'Cannot demote the only remaining admin. Promote another user first.',
    }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (body.name) updates.name = body.name.trim()
  if (body.role && ['admin', 'reviewer'].includes(body.role)) updates.role = body.role
  if (body.status && ['active', 'pending', 'suspended'].includes(body.status)) {
    updates.status = body.status
  }
  if (body.must_change_password !== undefined) {
    updates.must_change_password = body.must_change_password
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await adminClient.from('users').update(updates).eq('id', targetId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (body.password) {
    if (body.password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }
    const { error } = await adminClient.auth.admin.updateUserById(targetId, { password: body.password })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

async function isLastAdmin(userId: string): Promise<boolean> {
  const admin = createSupabaseAdmin()
  const { data: targetUser } = await admin
    .from('users')
    .select('role')
    .eq('id', userId)
    .single()
  if (targetUser?.role !== 'admin') return false

  const { count } = await admin
    .from('users')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'admin')

  return (count ?? 0) <= 1
}
