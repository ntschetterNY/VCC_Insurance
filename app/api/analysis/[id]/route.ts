import { NextRequest, NextResponse } from 'next/server'
import getDb from '@/lib/db'
import { extractPdfText } from '@/lib/pdf'
import { analyzeAccord25 } from '@/lib/ai'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const db = getDb()
    const analysis = db.prepare('SELECT * FROM ai_analysis WHERE submission_id = ?').get(parseInt(params.id)) as Record<string, string> | undefined
    if (!analysis) return NextResponse.json({ error: 'No analysis found' }, { status: 404 })

    return NextResponse.json({
      ...analysis,
      cg_numbers: JSON.parse(analysis.cg_numbers || '[]'),
      limits_found: JSON.parse(analysis.limits_found || '{}'),
      issues: JSON.parse(analysis.issues || '[]'),
      flags: JSON.parse(analysis.flags || '[]'),
      checklist: JSON.parse(analysis.checklist || '{}'),
    })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to fetch analysis' }, { status: 500 })
  }
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const db = getDb()
    const submissionId = parseInt(params.id)

    const submission = db.prepare(`
      SELECT s.*, sub.trade FROM submissions s
      JOIN subcontractors sub ON sub.id = s.sub_id
      WHERE s.id = ?
    `).get(submissionId) as { trade: string } | undefined

    if (!submission) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })

    const documents = db.prepare('SELECT * FROM documents WHERE submission_id = ?').all(submissionId) as Array<{ doc_type: string; filepath: string; extracted_text: string }>

    const accord25Doc = documents.find((d) => d.doc_type === 'accord25')
    const policyDoc = documents.find((d) => d.doc_type === 'policy')

    let accord25Text = accord25Doc?.extracted_text || ''
    let policyText: string | null = policyDoc?.extracted_text || null

    if (!accord25Text && accord25Doc?.filepath) {
      accord25Text = await extractPdfText(accord25Doc.filepath)
    }
    if (!policyText && policyDoc?.filepath) {
      policyText = await extractPdfText(policyDoc.filepath)
    }

    const schedule = db.prepare('SELECT * FROM schedule WHERE trade = ?').get(submission.trade) as Record<string, unknown> | undefined
    const analysis = await analyzeAccord25(accord25Text, policyText, schedule || null)

    db.prepare(`
      INSERT INTO ai_analysis (submission_id, cg_numbers, limits_found, limits_met, issues, flags, checklist, raw_response)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(submission_id) DO UPDATE SET
        cg_numbers = excluded.cg_numbers,
        limits_found = excluded.limits_found,
        limits_met = excluded.limits_met,
        issues = excluded.issues,
        flags = excluded.flags,
        checklist = excluded.checklist,
        raw_response = excluded.raw_response,
        created_at = datetime('now')
    `).run(
      submissionId,
      JSON.stringify(analysis.cg_numbers),
      JSON.stringify(analysis.limits_found),
      analysis.limits_met ? 1 : 0,
      JSON.stringify(analysis.issues),
      JSON.stringify(analysis.flags),
      JSON.stringify(analysis.checklist || {}),
      JSON.stringify(analysis)
    )

    return NextResponse.json({ success: true, analysis })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 })
  }
}
