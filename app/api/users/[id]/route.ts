import { NextRequest, NextResponse } from 'next/server'
import getDb from '@/lib/db'
import { hashPassword, requireAdmin } from '@/lib/auth'

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const admin = requireAdmin(_req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const targetId = parseInt(params.id)
  if (targetId === admin.id) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
  }

  const db = getDb()
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(targetId)
  db.prepare('DELETE FROM users WHERE id = ?').run(targetId)
  return NextResponse.json({ success: true })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { name, password, role } = await req.json() as { name?: string; password?: string; role?: string }
  const db = getDb()
  const targetId = parseInt(params.id)

  if (name) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name.trim(), targetId)
  if (role && ['admin', 'reviewer'].includes(role)) {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, targetId)
  }
  if (password) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), targetId)
  }

  return NextResponse.json({ success: true })
}
