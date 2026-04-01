import { NextRequest, NextResponse } from 'next/server'
import getDb from '@/lib/db'

export async function GET() {
  try {
    const db = getDb()
    const entries = db.prepare('SELECT * FROM schedule ORDER BY trade ASC').all()
    return NextResponse.json(entries)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to fetch schedule' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = getDb()
    const body = await req.json() as {
      trade: string
      gl_per_occurrence?: number
      gl_aggregate?: number
      workers_comp?: number
      auto_liability?: number
      umbrella?: number
      notes?: string
    }

    if (!body.trade) return NextResponse.json({ error: 'Trade is required' }, { status: 400 })

    const result = db.prepare(`
      INSERT INTO schedule (trade, gl_per_occurrence, gl_aggregate, workers_comp, auto_liability, umbrella, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      body.trade,
      body.gl_per_occurrence || null,
      body.gl_aggregate || null,
      body.workers_comp || null,
      body.auto_liability || null,
      body.umbrella || null,
      body.notes || null
    )

    return NextResponse.json({ id: result.lastInsertRowid }, { status: 201 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to create schedule entry' }, { status: 500 })
  }
}
