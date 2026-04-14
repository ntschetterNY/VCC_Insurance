import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { analyzeAccord25 } from '@/lib/ai'
import { sanitizeString } from '@/lib/security'

interface FileMeta {
  doc_type: string
  filename: string
  extracted_text: string
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

    // Support both new multi-file format and legacy two-file format
    const fileMetaRaw = formData.get('file_metadata') as string | null
    const multiFiles = formData.getAll('files') as File[]

    // Legacy fields (backward compat)
    const legacyAccord25 = formData.get('accord25') as File | null
    const legacyPolicy = formData.get('policy') as File | null
    const legacyAccord25Text = (formData.get('accord25_text') as string) || ''
    const legacyPolicyText = (formData.get('policy_text') as string) || ''

    const isMultiMode = fileMetaRaw && multiFiles.length > 0

    if (!isMultiMode && !legacyAccord25) {
      if (!name) {
        return NextResponse.json({ error: 'Name and at least one document are required' }, { status: 400 })
      }
    }

    if (!name) {
      return NextResponse.json({ error: 'Subcontractor name is required' }, { status: 400 })
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

    let accord25Text = ''
    let policyText: string | null = null

    if (isMultiMode) {
      // ---- New multi-file upload flow ----
      const fileMeta: FileMeta[] = JSON.parse(fileMetaRaw)

      for (let i = 0; i < multiFiles.length; i++) {
        const file = multiFiles[i]
        const meta = fileMeta[i]
        if (!file || !meta) continue

        const buffer = Buffer.from(await file.arrayBuffer())
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const storagePath = `${submissionId}/${meta.doc_type}_${safeName}`

        await supabase.storage.from('documents').upload(storagePath, buffer, {
          contentType: 'application/pdf',
        })

        await supabase.from('documents').insert({
          submission_id: submissionId,
          doc_type: meta.doc_type,
          filename: file.name,
          storage_path: storagePath,
          extracted_text: meta.extracted_text || null,
          processed_at: meta.extracted_text ? new Date().toISOString() : null,
        })

        // Collect text for AI analysis
        if (meta.doc_type === 'accord25' && meta.extracted_text) {
          accord25Text = meta.extracted_text
        } else if (
          (meta.doc_type.startsWith('policy') || meta.doc_type === 'endorsement') &&
          meta.extracted_text
        ) {
          // Concatenate all policy/endorsement text for analysis
          policyText = (policyText || '') + '\n\n--- ' + meta.filename + ' ---\n' + meta.extracted_text
        }
      }
    } else {
      // ---- Legacy two-file upload flow (backward compat) ----
      if (legacyAccord25) {
        const accord25Buffer = Buffer.from(await legacyAccord25.arrayBuffer())
        const accord25StoragePath = `${submissionId}/accord25_${legacyAccord25.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
        await supabase.storage.from('documents').upload(accord25StoragePath, accord25Buffer, {
          contentType: 'application/pdf',
        })

        await supabase.from('documents').insert({
          submission_id: submissionId,
          doc_type: 'accord25',
          filename: legacyAccord25.name,
          storage_path: accord25StoragePath,
          extracted_text: legacyAccord25Text || null,
          processed_at: legacyAccord25Text ? new Date().toISOString() : null,
        })

        accord25Text = legacyAccord25Text
      }

      if (legacyPolicy && legacyPolicy.size > 0) {
        const policyBuffer = Buffer.from(await legacyPolicy.arrayBuffer())
        const policyStoragePath = `${submissionId}/policy_${legacyPolicy.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
        await supabase.storage.from('documents').upload(policyStoragePath, policyBuffer, {
          contentType: 'application/pdf',
        })

        await supabase.from('documents').insert({
          submission_id: submissionId,
          doc_type: 'policy',
          filename: legacyPolicy.name,
          storage_path: policyStoragePath,
          extracted_text: legacyPolicyText || null,
          processed_at: legacyPolicyText ? new Date().toISOString() : null,
        })

        policyText = legacyPolicyText || null
      }
    }

    // Fall back if no accord25 text was captured
    if (!accord25Text) {
      accord25Text = '[PDF text extraction pending]'
    }

    // Find matching schedule requirements
    const { data: schedule } = await supabase
      .from('schedule')
      .select('*')
      .eq('trade', trade)
      .single()

    // Run AI analysis
    try {
      const analysis = await analyzeAccord25(accord25Text, policyText, schedule || null)
      await supabase.from('ai_analysis').upsert({
        submission_id: submissionId,
        cg_numbers: analysis.cg_numbers,
        limits_found: analysis.limits_found,
        limits_met: analysis.limits_met ?? false,
        issues: analysis.issues,
        flags: analysis.flags,
        checklist: analysis.checklist || {},
        raw_response: analysis,
      }, { onConflict: 'submission_id' })
    } catch (aiError) {
      console.error('AI analysis failed:', aiError)
      await supabase.from('ai_analysis').insert({
        submission_id: submissionId,
        issues: ['AI analysis failed — please re-run manually'],
      })
    }

    return NextResponse.json({ submissionId }, { status: 201 })
  } catch (err) {
    console.error('Upload error:', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
