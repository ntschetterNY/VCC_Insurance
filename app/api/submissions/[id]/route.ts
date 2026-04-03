import { NextRequest, NextResponse } from 'next/server'
import { unlinkSync, existsSync } from 'fs'
import getDb from '@/lib/db'
import { requireAuth, requireAdmin } from '@/lib/auth'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = requireAuth(_req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const db = getDb()
    const id = parseInt(params.id)

    const submission = db.prepare(`
      SELECT s.*, sub.name AS sub_name, sub.trade, sub.tier,
             u.name AS assigned_user_name
      FROM submissions s
      JOIN subcontractors sub ON sub.id = s.sub_id
      LEFT JOIN users u ON u.id = s.assigned_to
      WHERE s.id = ?
    `).get(id)

    if (!submission) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const documents = db.prepare('SELECT id, submission_id, doc_type, filename, processed_at FROM documents WHERE submission_id = ?').all(id)
    const analysis = db.prepare('SELECT * FROM ai_analysis WHERE submission_id = ?').get(id) as Record<string, string> | undefined
    const flags = db.prepare('SELECT * FROM reviewer_flags WHERE submission_id = ? ORDER BY created_at DESC').all(id)

    let parsedAnalysis = null
    if (analysis) {
      parsedAnalysis = {
        ...analysis,
        cg_numbers: JSON.parse(analysis.cg_numbers || '[]'),
        limits_found: JSON.parse(analysis.limits_found || '{}'),
        issues: JSON.parse(analysis.issues || '[]'),
        flags: JSON.parse(analysis.flags || '[]'),
        checklist: JSON.parse(analysis.checklist || '{}'),
      }
    }

    const sub = submission as Record<string, string>
    const schedule = sub.trade
      ? db.prepare('SELECT * FROM schedule WHERE trade = ?').get(sub.trade)
      : null

    const allUsers = db.prepare('SELECT id, name, role FROM users ORDER BY name').all()

    return NextResponse.json({
      ...(submission as object),
      documents,
      ai_analysis: parsedAnalysis,
      reviewer_flags: flags,
      schedule: schedule || null,
      available_reviewers: allUsers,
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to fetch submission' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = requireAuth(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const db = getDb()
    const id = parseInt(params.id)
    const body = await req.json() as { status?: string; reviewer_notes?: string; assigned_to?: number | null }

    const fields: string[] = []
    const values: unknown[] = []

    if (body.status) {
      fields.push('status = ?')
      values.push(body.status)
      if (body.status === 'approved' || body.status === 'rejected') {
        fields.push("reviewed_at = datetime('now')")
      }
    }
    if (body.reviewer_notes !== undefined) {
      fields.push('reviewer_notes = ?')
      values.push(body.reviewer_notes)
    }
    if (body.assigned_to !== undefined) {
      fields.push('assigned_to = ?')
      values.push(body.assigned_to)
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

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = requireAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })

  try {
    const db = getDb()
    const id = parseInt(params.id)

    // Get all documents to delete files from disk
    const documents = db.prepare('SELECT filepath FROM documents WHERE submission_id = ?').all(id) as Array<{ filepath: string }>

    const deleteAll = db.transaction(() => {
      db.prepare('DELETE FROM reviewer_flags WHERE submission_id = ?').run(id)
      db.prepare('DELETE FROM ai_analysis WHERE submission_id = ?').run(id)
      db.prepare('DELETE FROM documents WHERE submission_id = ?').run(id)
      db.prepare('DELETE FROM submissions WHERE id = ?').run(id)
    })
    deleteAll()

    // Remove files from disk after DB cleanup
    for (const doc of documents) {
      if (doc.filepath && existsSync(doc.filepath)) {
        try { unlinkSync(doc.filepath) } catch { /* ignore */ }
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to delete submission' }, { status: 500 })
  }
}
