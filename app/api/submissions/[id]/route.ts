import { NextRequest, NextResponse } from 'next/server'
import getDb from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const db = getDb()
    const id = parseInt(params.id)

    const submission = db.prepare(`
      SELECT s.*, sub.name AS sub_name, sub.trade, sub.tier
      FROM submissions s
      JOIN subcontractors sub ON sub.id = s.sub_id
      WHERE s.id = ?
    `).get(id)

    if (!submission) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const documents = db.prepare('SELECT * FROM documents WHERE submission_id = ?').all(id)
    const analysis = db.prepare('SELECT * FROM ai_analysis WHERE submission_id = ?').get(id) as Record<string, string> | undefined
    const flags = db.prepare('SELECT * FROM reviewer_flags WHERE submission_id = ? ORDER BY created_at DESC').all(id)

    // Parse JSON fields in analysis
    let parsedAnalysis = null
    if (analysis) {
      parsedAnalysis = {
        ...analysis,
        cg_numbers: JSON.parse(analysis.cg_numbers || '[]'),
        limits_found: JSON.parse(analysis.limits_found || '{}'),
        issues: JSON.parse(analysis.issues || '[]'),
        flags: JSON.parse(analysis.flags || '[]'),
      }
    }

    // Fetch matching schedule for the trade
    const sub = submission as Record<string, string>
    const schedule = sub.trade
      ? db.prepare('SELECT * FROM schedule WHERE trade = ?').get(sub.trade)
      : null

    // Return flat structure the review page expects
    return NextResponse.json({
      ...(submission as object),
      documents,
      ai_analysis: parsedAnalysis,
      reviewer_flags: flags,
      schedule: schedule || null,
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to fetch submission' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const db = getDb()
    const id = parseInt(params.id)
    const body = await req.json() as { status?: string; reviewer_notes?: string }

    const fields: string[] = []
    const values: unknown[] = []

    if (body.status) {
      fields.push('status = ?')
      values.push(body.status)
      if (body.status === 'approved' || body.status === 'rejected') {
        // Use SQL literal — no placeholder needed for datetime('now')
        fields.push("reviewed_at = datetime('now')")
      }
    }
    if (body.reviewer_notes !== undefined) {
      fields.push('reviewer_notes = ?')
      values.push(body.reviewer_notes)
    }

    if (fields.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

    values.push(id)
    db.prepare(`UPDATE submissions SET ${fields.join(', ')} WHERE id = ?`).run(...values)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to update submission' }, { status: 500 })
  }
}
