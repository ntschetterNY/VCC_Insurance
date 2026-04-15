import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { classifyDocument, analyzeAccord25, getAndClearUsageBuffer } from '@/lib/ai'
import { sanitizeString } from '@/lib/security'
import pdfParse from 'pdf-parse'

// ---------------------------------------------------------------------------
// Extract text from a PDF buffer server-side
// ---------------------------------------------------------------------------
async function extractTextFromBuffer(buffer: Buffer, maxChars = 8000): Promise<string> {
  try {
    const data = await pdfParse(buffer)
    return data.text.slice(0, maxChars)
  } catch (err) {
    console.error('PDF text extraction failed:', err)
    return ''
  }
}

export async function POST(request: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const formData = await request.formData()

    const name = sanitizeString((formData.get('name') as string) ?? '')
    const trade = sanitizeString((formData.get('trade') as string) ?? '')
    const tier = formData.get('tier') as string
    const procoreProjectId = (formData.get('procore_project_id') as string)?.trim() || null
    const procoreContractId = (formData.get('procore_contract_id') as string)?.trim() || null

    const uploadedFiles = formData.getAll('files') as File[]

    if (!name) {
      return NextResponse.json({ error: 'Subcontractor name is required' }, { status: 400 })
    }
    if (uploadedFiles.length === 0) {
      return NextResponse.json({ error: 'At least one PDF document is required' }, { status: 400 })
    }

    const supabase = await getDb()

    // Upsert subcontractor
    const { data: existingSub } = await supabase
      .from('subcontractors')
      .select('id')
      .eq('name', name)
      .single()

    let subId: number
    if (existingSub) {
      subId = existingSub.id
    } else {
      const { data: newSub, error: subError } = await supabase
        .from('subcontractors')
        .insert({ name, trade, tier })
        .select('id')
        .single()
      if (subError || !newSub) throw subError ?? new Error('Failed to create subcontractor')
      subId = newSub.id
    }

    // Create submission
    const { data: submission, error: subErr } = await supabase
      .from('submissions')
      .insert({
        sub_id: subId,
        status: 'reviewing',
        procore_project_id: procoreProjectId,
        procore_contract_id: procoreContractId,
      })
      .select('id')
      .single()
    if (subErr || !submission) throw subErr ?? new Error('Failed to create submission')
    const submissionId = submission.id

    // ------------------------------------------------------------------
    // Process each uploaded file: extract text → classify with Haiku →
    // store in Supabase Storage + documents table
    // ------------------------------------------------------------------
    let accord25Text = ''
    let policyText: string | null = null

    for (const file of uploadedFiles) {
      const buffer = Buffer.from(await file.arrayBuffer())

      // 1. Extract text server-side
      const text = await extractTextFromBuffer(buffer)

      // 2. Classify with Haiku
      let docType = 'other'
      if (text && text.trim().length >= 20) {
        try {
          const classification = await classifyDocument(text, submissionId)
          docType = classification.doc_type
          console.log(`[Upload] Classified "${file.name}" as ${docType} (${Math.round(classification.confidence * 100)}%)`)
        } catch (err) {
          console.error(`[Upload] Classification failed for "${file.name}":`, err)
        }
      } else {
        console.warn(`[Upload] Insufficient text from "${file.name}" — marked as "other"`)
      }

      // 3. Upload to Supabase Storage
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const storagePath = `${submissionId}/${docType}_${safeName}`

      await supabase.storage.from('documents').upload(storagePath, buffer, {
        contentType: 'application/pdf',
      })

      // 4. Insert document record
      await supabase.from('documents').insert({
        submission_id: submissionId,
        doc_type: docType,
        filename: file.name,
        storage_path: storagePath,
        extracted_text: text || null,
        processed_at: new Date().toISOString(),
      })

      // 5. Collect text for the deep analysis step
      if (docType === 'accord25' && text) {
        accord25Text = text
      } else if (
        (docType.startsWith('policy') || docType === 'endorsement') && text
      ) {
        policyText = (policyText || '') + '\n\n--- ' + file.name + ' ---\n' + text
      }
    }

    // Fall back if no ACORD 25 text was identified
    if (!accord25Text) {
      accord25Text = '[PDF text extraction pending]'
    }

    // Find matching schedule requirements
    const { data: schedule } = await supabase
      .from('schedule')
      .select('*')
      .eq('trade', trade)
      .single()

    // Fetch active review checks from memory
    const { data: reviewCheckEntries } = await supabase
      .from('memory')
      .select('title, description')
      .eq('category', 'Review Check')
      .eq('active', true)

    const reviewChecks = (reviewCheckEntries ?? []).map((e: { title: string; description: string }) => ({
      title: e.title,
      description: e.description || '',
    }))

    // Run deep AI analysis (Sonnet)
    try {
      const analysis = await analyzeAccord25(accord25Text, policyText, schedule || null, reviewChecks, submissionId)
      await supabase.from('ai_analysis').upsert({
        submission_id: submissionId,
        cg_numbers: analysis.cg_numbers,
        limits_found: analysis.limits_found,
        limits_met: analysis.limits_met ?? false,
        issues: analysis.issues,
        flags: analysis.flags,
        checklist: analysis.checklist || {},
        custom_checks: (analysis as unknown as Record<string, unknown>).custom_checks || {},
        raw_response: analysis,
      }, { onConflict: 'submission_id' })
    } catch (aiError) {
      console.error('AI analysis failed:', aiError)
      await supabase.from('ai_analysis').insert({
        submission_id: submissionId,
        issues: ['AI analysis failed — please re-run manually'],
      })
    }

    // Flush usage log to DB
    const usageEntries = getAndClearUsageBuffer()
    if (usageEntries.length > 0) {
      const { error: usageErr } = await supabase.from('ai_usage_log').insert(usageEntries)
      if (usageErr) {
        console.error('Failed to log AI usage:', usageErr)
      }
    }

    return NextResponse.json({ submissionId }, { status: 201 })
  } catch (err) {
    console.error('Upload error:', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
