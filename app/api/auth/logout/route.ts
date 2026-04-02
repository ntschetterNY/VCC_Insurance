import { NextRequest, NextResponse } from 'next/server'
import { deleteSession, getTokenFromRequest, SESSION_COOKIE } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const token = getTokenFromRequest(req)
  if (token) deleteSession(token)
  const res = NextResponse.json({ success: true })
  res.cookies.set(SESSION_COOKIE, '', { maxAge: 0, path: '/' })
  return res
}
