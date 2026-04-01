import crypto from 'crypto'
import { cookies } from 'next/headers'
import getDb from './db'

export const SESSION_COOKIE = 'vcc_session'
export const SESSION_DURATION_DAYS = 30

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  const attemptHash = crypto.scryptSync(password, salt, 64).toString('hex')
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(attemptHash, 'hex'))
}

export function createSession(userId: number): string {
  const db = getDb()
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  db.prepare('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)').run(userId, token, expiresAt)
  // Clean up old expired sessions
  db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run()
  return token
}

export function deleteSession(token: string): void {
  const db = getDb()
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
}

export interface SessionUser {
  id: number
  email: string
  name: string
  role: string
}

export function getSessionUser(token: string): SessionUser | null {
  const db = getDb()
  const row = db.prepare(`
    SELECT u.id, u.email, u.name, u.role
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `).get(token) as SessionUser | undefined
  return row ?? null
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE)?.value
    if (!token) return null
    return getSessionUser(token)
  } catch {
    return null
  }
}

export function getTokenFromRequest(req: Request): string | null {
  const cookieHeader = req.headers.get('cookie') ?? ''
  const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))
  return match?.[1] ?? null
}

export function requireAdmin(req: Request): SessionUser | null {
  const token = getTokenFromRequest(req)
  if (!token) return null
  const user = getSessionUser(token)
  if (!user || user.role !== 'admin') return null
  return user
}

export function requireAuth(req: Request): SessionUser | null {
  const token = getTokenFromRequest(req)
  if (!token) return null
  return getSessionUser(token)
}
