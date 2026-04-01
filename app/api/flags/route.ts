import { NextRequest, NextResponse } from 'next/server'
import getDb from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const db = getDb()
    const body = await req.json() as { submission_id: number; flag_type: string; description: string; severity: string }

    if (!body.submission_id || !body.description) {
      return NextResponse.json({ error: 'submission_id and description are required' }, { status: 400 })
    }

    const result = db.prepare(`
      INSERT INTO reviewer_flags (submission_id, flag_type, description, severity)
      VALUES (?, ?, ?, ?)
    `).run(body.submission_id, body.flag_type || 'general', body.description, body.severity || 'medium')

    return NextResponse.json({ id: result.lastInsertRowid }, { status: 201 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to create flag' }, { status: 500 })
  }
}
