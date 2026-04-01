import { NextRequest, NextResponse } from 'next/server'
import getDb from '@/lib/db'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const db = getDb()
    const body = await req.json() as {
      trade?: string
      gl_per_occurrence?: number
      gl_aggregate?: number
      workers_comp?: number
      auto_liability?: number
      umbrella?: number
      notes?: string
    }

    db.prepare(`
      UPDATE schedule SET
        trade = COALESCE(?, trade),
        gl_per_occurrence = ?,
        gl_aggregate = ?,
        workers_comp = ?,
        auto_liability = ?,
        umbrella = ?,
        notes = ?
      WHERE id = ?
    `).run(
      body.trade || null,
      body.gl_per_occurrence ?? null,
      body.gl_aggregate ?? null,
      body.workers_comp ?? null,
      body.auto_liability ?? null,
      body.umbrella ?? null,
      body.notes ?? null,
      parseInt(params.id)
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to update schedule' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const db = getDb()
    db.prepare('DELETE FROM schedule WHERE id = ?').run(parseInt(params.id))
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to delete schedule entry' }, { status: 500 })
  }
}
