import { NextRequest, NextResponse } from 'next/server'
import getDb from '@/lib/db'

export async function GET() {
  try {
    const db = getDb()
    const entries = db.prepare('SELECT * FROM memory ORDER BY created_at DESC').all()
    return NextResponse.json(entries)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to fetch memory' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = getDb()
    const body = await req.json() as {
      title: string
      description?: string
      category?: string
      severity?: string
    }

    if (!body.title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })

    const result = db.prepare(`
      INSERT INTO memory (title, description, category, severity)
      VALUES (?, ?, ?, ?)
    `).run(
      body.title,
      body.description || null,
      body.category || 'Watch Item',
      body.severity || 'medium'
    )

    return NextResponse.json({ id: result.lastInsertRowid }, { status: 201 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to create memory entry' }, { status: 500 })
  }
}
