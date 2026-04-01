import { NextRequest, NextResponse } from 'next/server'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import path from 'path'
import getDb from '@/lib/db'
import { extractPdfText } from '@/lib/pdf'
import { analyzeAccord25 } from '@/lib/ai'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()

    const name = (formData.get('name') as string)?.trim()
    const trade = (formData.get('trade') as string)?.trim()
    const tier = formData.get('tier') as string
    const accord25File = formData.get('accord25') as File | null
    const policyFile = formData.get('policy') as File | null

    if (!name || !accord25File) {
      return NextResponse.json({ error: 'Name and Accord 25 file are required' }, { status: 400 })
    }

    const uploadsDir = path.join(process.cwd(), 'uploads')
    if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true })

    const db = getDb()

    // Upsert subcontractor
    let sub = db.prepare('SELECT * FROM subcontractors WHERE name = ?').get(name) as { id: number } | undefined
    if (!sub) {
      const result = db.prepare('INSERT INTO subcontractors (name, trade, tier) VALUES (?, ?, ?)').run(name, trade, tier)
      sub = { id: result.lastInsertRowid as number }
    }

    // Create submission
    const submissionResult = db.prepare('INSERT INTO submissions (sub_id, status) VALUES (?, ?)').run(sub.id, 'reviewing')
    const submissionId = submissionResult.lastInsertRowid as number

    const savedPaths: { accord25: string; policy?: string } = { accord25: '' }

    // Save Accord 25
    const accord25Buffer = Buffer.from(await accord25File.arrayBuffer())
    const accord25Filename = `${submissionId}_accord25_${accord25File.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const accord25Path = path.join(uploadsDir, accord25Filename)
    writeFileSync(accord25Path, accord25Buffer)
    savedPaths.accord25 = accord25Path

    db.prepare('INSERT INTO documents (submission_id, doc_type, filename, filepath) VALUES (?, ?, ?, ?)')
      .run(submissionId, 'accord25', accord25File.name, accord25Path)

    // Save policy if provided
    if (policyFile && policyFile.size > 0) {
      const policyBuffer = Buffer.from(await policyFile.arrayBuffer())
      const policyFilename = `${submissionId}_policy_${policyFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const policyPath = path.join(uploadsDir, policyFilename)
      writeFileSync(policyPath, policyBuffer)
      savedPaths.policy = policyPath
      db.prepare('INSERT INTO documents (submission_id, doc_type, filename, filepath) VALUES (?, ?, ?, ?)')
        .run(submissionId, 'policy', policyFile.name, policyPath)
    }

    // Extract PDF text
    let accord25Text = ''
    let policyText: string | null = null
    try {
      accord25Text = await extractPdfText(savedPaths.accord25)
      db.prepare('UPDATE documents SET extracted_text = ?, processed_at = datetime(\'now\') WHERE submission_id = ? AND doc_type = ?')
        .run(accord25Text, submissionId, 'accord25')
    } catch {
      accord25Text = '[PDF text extraction failed]'
    }

    if (savedPaths.policy) {
      try {
        policyText = await extractPdfText(savedPaths.policy)
        db.prepare('UPDATE documents SET extracted_text = ?, processed_at = datetime(\'now\') WHERE submission_id = ? AND doc_type = ?')
          .run(policyText, submissionId, 'policy')
      } catch {
        policyText = null
      }
    }

    // Find matching schedule requirements
    const schedule = db.prepare('SELECT * FROM schedule WHERE trade = ?').get(trade) as Record<string, unknown> | undefined

    // Run AI analysis
    try {
      const analysis = await analyzeAccord25(accord25Text, policyText, schedule || null)
      db.prepare(`
        INSERT INTO ai_analysis (submission_id, cg_numbers, limits_found, limits_met, issues, flags, raw_response)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(submission_id) DO UPDATE SET
          cg_numbers = excluded.cg_numbers,
          limits_found = excluded.limits_found,
          limits_met = excluded.limits_met,
          issues = excluded.issues,
          flags = excluded.flags,
          raw_response = excluded.raw_response,
          created_at = datetime('now')
      `).run(
        submissionId,
        JSON.stringify(analysis.cg_numbers),
        JSON.stringify(analysis.limits_found),
        analysis.limits_met ? 1 : 0,
        JSON.stringify(analysis.issues),
        JSON.stringify(analysis.flags),
        JSON.stringify(analysis)
      )
    } catch (aiError) {
      console.error('AI analysis failed:', aiError)
      // Store a placeholder so the submission isn't stuck
      db.prepare(`
        INSERT OR IGNORE INTO ai_analysis (submission_id, issues)
        VALUES (?, ?)
      `).run(submissionId, JSON.stringify(['AI analysis failed — please re-run manually']))
    }

    return NextResponse.json({ submissionId }, { status: 201 })
  } catch (err) {
    console.error('Upload error:', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
