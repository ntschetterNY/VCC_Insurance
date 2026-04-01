import { NextRequest, NextResponse } from 'next/server'
import getDb from '@/lib/db'
import { hashPassword, requireAdmin } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const user = requireAdmin(req)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const db = getDb()
  const users = db.prepare('SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC').all()
  return NextResponse.json(users)
}

export async function POST(req: NextRequest) {
  const admin = requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { email, name, password, role } = await req.json() as {
    email: string; name: string; password: string; role: string
  }
  if (!email || !name || !password) {
    return NextResponse.json({ error: 'Email, name, and password are required' }, { status: 400 })
  }
  if (!['admin', 'reviewer'].includes(role)) {
    return NextResponse.json({ error: 'Role must be admin or reviewer' }, { status: 400 })
  }

  const db = getDb()
  try {
    const result = db.prepare(
      'INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)'
    ).run(email.toLowerCase().trim(), name.trim(), hashPassword(password), role)
    return NextResponse.json({ id: result.lastInsertRowid }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Email already exists' }, { status: 409 })
  }
}
