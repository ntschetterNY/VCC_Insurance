import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { analyzeAccord25, getAndClearUsageBuffer } from '@/lib/ai'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await getDb()
    const { data: analysis, error } = await supabase
      .from('ai_analysis')
      .select('*')
      .eq('submission_id', parseInt(params.id))
      .single()

    if (error || !analysis) return NextResponse.json({ error: 'No analysis found' }, { status: 404 })
    return NextResponse.json(analysis)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to fetch analysis' }, { status: 500 })
  }
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await getDb()
    const submissionId = parseInt(params.id)

    const { data: submission, error: subErr } = await supabase
      .from('submissions')
      .select('*, subcontractors ( trade )')
      .eq('id', submissionId)
      .single()

    if (subErr || !submission) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })

    const { data: documents } = await supabase
      .from('documents')
      .select('*')
      .eq('submission_id', submissionId)

    const accord25Doc = documents?.find((d: Record<string, unknown>) => d.doc_type === 'accord25')
    const policyDoc = documents?.find((d: Record<string, unknown>) => d.doc_type === 'policy')

    const accord25Text = (accord25Doc?.extracted_text as string) || ''
    const policyText: string | null = (policyDoc?.extracted_text as string) || null

    const trade = (submission.subcontractors as Record<string, unknown>)?.trade as string
    const { data: schedule } = await supabase
      .from('schedule')
      .select('*')
      .eq('trade', trade)
      .single()

    // Fetch active review checks
    const { data: reviewCheckEntries } = await supabase
      .from('memory')
      .select('title, description')
      .eq('category', 'Review Check')
      .eq('active', true)

    const reviewChecks = (reviewCheckEntries ?? []).map((e: { title: string; description: string }) => ({
      title: e.title,
      description: e.description || '',
    }))

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

    // Flush usage log
    const usageEntries = getAndClearUsageBuffer()
    if (usageEntries.length > 0) {
      await supabase.from('ai_usage_log').insert(usageEntries).catch((err: unknown) => {
        console.error('Failed to log AI usage:', err)
      })
    }

    return NextResponse.json({ success: true, analysis })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 })
  }
}
