import { NextRequest, NextResponse } from 'next/server'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import path from 'path'
import getDb from '@/lib/db'
import { extractPdfText } from '@/lib/pdf'
import { analyzeAccord25 } from '@/lib/ai'
import { requireAuth } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const user = requireAuth(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const formData = await request.formData()

    const name = (formData.get('name') as string)?.trim()
    const trade = (formData.get('trade') as string)?.trim()
    const tier = formData.get('tier') as string
    const accord25File = formData.get('accord25') as File | null
    const policyFile = formData.get('policy') as File | null
    const procoreProjectId = (formData.get('procore_project_id') as string)?.trim() || null
    const procoreContractId = (formData.get('procore_contract_id') as string)?.trim() || null

    // Pre-extracted text sent from the client (offloads PDF parsing to uploader's browser)
    const preExtractedAccord25 = (formData.get('accord25_text') as string) || ''
    const preExtractedPolicy = (formData.get('policy_text') as string) || ''

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
    const submissionResult = db.prepare(
      'INSERT INTO submissions (sub_id, status, procore_project_id, procore_contract_id) VALUES (?, ?, ?, ?)'
    ).run(sub.id, 'reviewing', procoreProjectId, procoreContractId)
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

    // Use pre-extracted text from client if available (offloads processing to uploader's machine)
    // Fall back to server-side extraction only if client didn't provide text
    let accord25Text = preExtractedAccord25
    let policyText: string | null = preExtractedPolicy || null

    if (!accord25Text) {
      try {
        accord25Text = await extractPdfText(savedPaths.accord25)
      } catch {
        accord25Text = '[PDF text extraction failed]'
      }
    }

    if (!policyText && savedPaths.policy) {
      try {
        policyText = await extractPdfText(savedPaths.policy)
      } catch {
        policyText = null
      }
    }

    // Persist extracted text
    db.prepare("UPDATE documents SET extracted_text = ?, processed_at = datetime('now') WHERE submission_id = ? AND doc_type = ?")
      .run(accord25Text, submissionId, 'accord25')
    if (policyText && savedPaths.policy) {
      db.prepare("UPDATE documents SET extracted_text = ?, processed_at = datetime('now') WHERE submission_id = ? AND doc_type = ?")
        .run(policyText, submissionId, 'policy')
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
      db.prepare('INSERT OR IGNORE INTO ai_analysis (submission_id, issues) VALUES (?, ?)')
        .run(submissionId, JSON.stringify(['AI analysis failed — please re-run manually']))
    }

    return NextResponse.json({ submissionId }, { status: 201 })
  } catch (err) {
    console.error('Upload error:', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
