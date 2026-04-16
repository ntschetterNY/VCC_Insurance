import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { classifyDocument, analyzeAccord25, getAndClearUsageBuffer, coerceDocType, legacyDocTypeFallback } from '@/lib/ai'
import { sanitizeString, generateFileHash } from '@/lib/security'
import { classifyTrade } from '@/lib/scheduleClassification'
import pdfParse from 'pdf-parse'

// Allow up to 60s for PDF extraction + AI classification + analysis
export const maxDuration = 60

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
    const scheduleType = (formData.get('schedule_type') as string)?.trim() || null
    const procoreProjectId = (formData.get('procore_project_id') as string)?.trim() || null
    const procoreContractId = (formData.get('procore_contract_id') as string)?.trim() || null

    const uploadedFiles = formData.getAll('files') as File[]

    // Parse optional manual document type assignments (filename → doc_type)
    let manualDocTypes: Record<string, string> = {}
    const docTypesJson = formData.get('doc_types') as string | null
    if (docTypesJson) {
      try {
        manualDocTypes = JSON.parse(docTypesJson)
      } catch {
        console.warn('[Upload] Failed to parse doc_types JSON')
      }
    }

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
      // Update schedule_type if provided
      if (scheduleType) {
        await supabase
          .from('subcontractors')
          .update({ schedule_type: scheduleType })
          .eq('id', subId)
      }
    } else {
      const { data: newSub, error: subError } = await supabase
        .from('subcontractors')
        .insert({ name, trade, tier, schedule_type: scheduleType })
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

    // Fetch classification hints from memory to improve AI accuracy
    const { data: classificationMemory } = await supabase
      .from('memory')
      .select('description')
      .eq('category', 'Classification Rule')
      .eq('active', true)
    const classificationHints = (classificationMemory ?? [])
      .map((m: { description: string }) => m.description)
      .filter(Boolean)

    let accord25Text = ''
    let policyText: string | null = null

    for (const file of uploadedFiles) {
      const buffer = Buffer.from(await file.arrayBuffer())

      // 1. Extract text server-side
      const text = await extractTextFromBuffer(buffer)

      // 2. Classify — use manual type if provided, otherwise AI classify with
      // Haiku. All values run through coerceDocType() so unknown strings
      // become "other" and can never violate documents_doc_type_check.
      let docType: string = 'other'
      const manualType = manualDocTypes[file.name]
      if (manualType) {
        docType = coerceDocType(manualType)
        console.log(`[Upload] Using manual type for "${file.name}": ${docType}`)
      } else if (text && text.trim().length >= 20) {
        try {
          const classification = await classifyDocument(text, submissionId, classificationHints)
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
      const fileHash = generateFileHash(buffer)
      const storagePath = `${submissionId}/${fileHash}_${docType}_${safeName}`

      // The storage path embeds the SHA-256 content hash, so an "already
      // exists" collision means the existing blob is byte-identical. Treat it
      // as success — we can't use `upsert: true` because the storage bucket
      // RLS policy doesn't grant UPDATE to authenticated users (see
      // supabase/migrations/001_initial_schema.sql).
      const { error: storageError } = await supabase.storage.from('documents').upload(storagePath, buffer, {
        contentType: 'application/pdf',
      })
      const isDuplicate =
        storageError &&
        /already exists|duplicate|resource already exists/i.test(storageError.message)
      if (storageError && !isDuplicate) {
        console.error(`[Upload] Storage upload failed for "${file.name}":`, storageError)
        throw new Error(`Failed to store file "${file.name}": ${storageError.message}`)
      }

      // 4. Insert document record. Log the final docType right before writing
      // so any future CHECK-constraint violation is immediately diagnosable
      // from Vercel function logs.
      console.log(`[Upload] Inserting "${file.name}" with doc_type="${docType}"`)
      const docRow = {
        submission_id: submissionId,
        doc_type: docType,
        filename: file.name,
        storage_path: storagePath,
        extracted_text: text || null,
        processed_at: new Date().toISOString(),
      }
      let { error: docInsertError } = await supabase.from('documents').insert(docRow)

      // If the DB's doc_type CHECK constraint hasn't been upgraded (i.e.
      // migration 005/002 wasn't applied), retry with the legacy-compatible
      // value so the upload still succeeds. The reviewer can reclassify once
      // the migration is applied.
      if (docInsertError && /documents_doc_type_check/i.test(docInsertError.message)) {
        const fallback = legacyDocTypeFallback(docType)
        console.warn(
          `[Upload] documents_doc_type_check rejected "${docType}" for "${file.name}". ` +
            `The DB is running an old schema — apply supabase/migrations/005_ensure_doc_type_constraint.sql. ` +
            `Retrying with legacy-compatible doc_type="${fallback}".`,
        )
        const retry = await supabase.from('documents').insert({ ...docRow, doc_type: fallback })
        docInsertError = retry.error
      }

      if (docInsertError) {
        console.error(`[Upload] Document insert failed for "${file.name}":`, docInsertError)
        throw new Error(`Failed to save document record for "${file.name}": ${docInsertError.message}`)
      }

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

    // Find matching schedule requirements — try exact match first, then fuzzy
    let schedule = null
    const { data: exactSchedule } = await supabase
      .from('schedule')
      .select('*')
      .eq('trade', trade)
      .single()
    schedule = exactSchedule

    if (!schedule && trade) {
      const match = classifyTrade(trade)
      if (match) {
        const { data: fuzzySchedule } = await supabase
          .from('schedule')
          .select('*')
          .eq('trade', match.matchedTrade)
          .single()
        schedule = fuzzySchedule
      }
    }

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
      // Log full diagnostic context — the actual error category will be
      // shown to the user when they click "Re-run Analysis" via
      // /api/analysis/[id], which has rich error categorization.
      const e = aiError as { status?: number; error?: { type?: string; message?: string } }
      console.error('[Upload] AI analysis failed during upload:', {
        message: aiError instanceof Error ? aiError.message : String(aiError),
        http_status: e.status,
        provider_error_type: e.error?.type,
        provider_error_message: e.error?.message,
      })
      await supabase.from('ai_analysis').insert({
        submission_id: submissionId,
        issues: [
          'AI analysis failed during upload — click "Re-run Analysis" to see the detailed error.',
        ],
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
    const message = err instanceof Error ? err.message : 'Upload failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
