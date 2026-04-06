import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { analyzeAccord25 } from '@/lib/ai'
import { sanitizeString } from '@/lib/security'

export async function POST(request: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const formData = await request.formData()

    const name = sanitizeString((formData.get('name') as string) ?? '')
    const trade = sanitizeString((formData.get('trade') as string) ?? '')
    const tier = formData.get('tier') as string
    const accord25File = formData.get('accord25') as File | null
    const policyFile = formData.get('policy') as File | null
    const procoreProjectId = (formData.get('procore_project_id') as string)?.trim() || null
    const procoreContractId = (formData.get('procore_contract_id') as string)?.trim() || null

    // Pre-extracted text from the client (offloads PDF parsing)
    const preExtractedAccord25 = (formData.get('accord25_text') as string) || ''
    const preExtractedPolicy = (formData.get('policy_text') as string) || ''

    if (!name || !accord25File) {
      return NextResponse.json({ error: 'Name and Accord 25 file are required' }, { status: 400 })
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

    // Upload Accord 25 to Supabase Storage
    const accord25Buffer = Buffer.from(await accord25File.arrayBuffer())
    const accord25StoragePath = `${submissionId}/accord25_${accord25File.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    await supabase.storage.from('documents').upload(accord25StoragePath, accord25Buffer, {
      contentType: 'application/pdf',
    })

    await supabase.from('documents').insert({
      submission_id: submissionId,
      doc_type: 'accord25',
      filename: accord25File.name,
      storage_path: accord25StoragePath,
      extracted_text: preExtractedAccord25 || null,
      processed_at: preExtractedAccord25 ? new Date().toISOString() : null,
    })

    // Upload policy if provided
    if (policyFile && policyFile.size > 0) {
      const policyBuffer = Buffer.from(await policyFile.arrayBuffer())
      const policyStoragePath = `${submissionId}/policy_${policyFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      await supabase.storage.from('documents').upload(policyStoragePath, policyBuffer, {
        contentType: 'application/pdf',
      })

      await supabase.from('documents').insert({
        submission_id: submissionId,
        doc_type: 'policy',
        filename: policyFile.name,
        storage_path: policyStoragePath,
        extracted_text: preExtractedPolicy || null,
        processed_at: preExtractedPolicy ? new Date().toISOString() : null,
      })
    }

    const accord25Text = preExtractedAccord25 || '[PDF text extraction pending]'
    const policyText: string | null = preExtractedPolicy || null

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
