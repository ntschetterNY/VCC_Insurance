import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { analyzeAccord25, getAndClearUsageBuffer } from '@/lib/ai'

// Allow up to 60s for deep AI analysis (Sonnet)
export const maxDuration = 60

// ---------------------------------------------------------------------------
// Diagnostic helpers — translate raw errors into actionable user messages.
// Anthropic SDK errors typically expose `status` (HTTP code) and `error`
// (provider error body). Network errors usually have a `cause.code`.
// ---------------------------------------------------------------------------
type Diag = { error: string; hint: string; debug?: Record<string, unknown> }

function diagnoseError(err: unknown, ctx: Record<string, unknown>): Diag {
  const msg = err instanceof Error ? err.message : String(err)
  const e = err as {
    status?: number
    name?: string
    code?: string
    error?: { type?: string; message?: string }
    cause?: { code?: string; message?: string }
  }
  const status = e.status
  const providerType = e.error?.type
  const providerMessage = e.error?.message
  const causeCode = e.cause?.code

  const debug = {
    ...ctx,
    error_message: msg,
    error_name: e.name,
    http_status: status,
    provider_error_type: providerType,
    provider_error_message: providerMessage,
    cause_code: causeCode,
  }

  if (msg.includes('ANTHROPIC_API_KEY')) {
    return {
      error: 'ANTHROPIC_API_KEY is not configured.',
      hint: 'Set ANTHROPIC_API_KEY in your Vercel project env vars (Settings → Environment Variables) and redeploy.',
      debug,
    }
  }
  if (status === 401 || providerType === 'authentication_error') {
    return {
      error: 'Anthropic rejected the API key (401).',
      hint: 'The ANTHROPIC_API_KEY is set but invalid, revoked, or for the wrong workspace. Generate a fresh key at console.anthropic.com and update it in Vercel env vars.',
      debug,
    }
  }
  if (status === 403 || providerType === 'permission_error') {
    return {
      error: 'Anthropic denied the request (403).',
      hint: 'The API key may lack access to the Sonnet model, or your workspace has spending controls blocking it. Check console.anthropic.com → Workspaces.',
      debug,
    }
  }
  if (status === 404 || providerType === 'not_found_error') {
    return {
      error: 'Anthropic returned 404 — the model name is wrong or unavailable.',
      hint: 'The analysis is calling a model that may have been deprecated. Check lib/ai.ts and use a current model ID (e.g. claude-sonnet-4-5 or claude-sonnet-4-6).',
      debug,
    }
  }
  if (status === 429 || providerType === 'rate_limit_error') {
    return {
      error: 'Anthropic rate-limited the request (429).',
      hint: 'Wait a minute and try again. If it keeps happening, raise your tier at console.anthropic.com → Plans & Billing.',
      debug,
    }
  }
  if (status === 529 || providerType === 'overloaded_error') {
    return {
      error: 'Anthropic API is overloaded (529).',
      hint: 'This is on Anthropic\'s side. Retry in a few seconds.',
      debug,
    }
  }
  if (status === 400 || providerType === 'invalid_request_error') {
    return {
      error: `Anthropic rejected the request (400): ${providerMessage ?? 'invalid request'}`,
      hint: 'Usually means the prompt exceeded the model\'s context window or contained an invalid parameter. Check the debug info for specifics.',
      debug,
    }
  }
  if (status && status >= 500) {
    return {
      error: `Anthropic server error (${status}).`,
      hint: 'Transient Anthropic-side issue. Retry in a few seconds.',
      debug,
    }
  }
  if (causeCode === 'ETIMEDOUT' || causeCode === 'UND_ERR_CONNECT_TIMEOUT' || /timeout/i.test(msg)) {
    return {
      error: 'Request to Anthropic timed out.',
      hint: 'The Vercel function maxDuration is 60s. If the analysis is consistently slow, reduce the prompt size or upgrade your Vercel plan.',
      debug,
    }
  }
  if (causeCode === 'ENOTFOUND' || causeCode === 'ECONNREFUSED' || causeCode === 'EAI_AGAIN') {
    return {
      error: 'Network error reaching Anthropic.',
      hint: 'Vercel could not resolve or connect to api.anthropic.com. This is rare — check Vercel\'s status page and retry.',
      debug,
    }
  }
  if (msg.includes('No valid JSON found in AI response')) {
    return {
      error: 'Anthropic responded but the response did not contain valid JSON.',
      hint: 'The model returned prose instead of JSON. This usually means the prompt was too short or the model was confused. Re-run; if it persists, check Vercel function logs for the raw response.',
      debug,
    }
  }
  return {
    error: `Analysis failed: ${msg}`,
    hint: 'Unrecognized error. Check the debug field below and the Vercel function logs.',
    debug,
  }
}

// ---------------------------------------------------------------------------
// GET — fetch existing analysis row
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// POST — run (or re-run) the deep AI analysis
// ---------------------------------------------------------------------------
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const submissionId = parseInt(params.id)
  console.log(`[Analysis] Starting analysis for submission ${submissionId}`)

  // Pre-flight: API key configured?
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[Analysis] ANTHROPIC_API_KEY env var is not set')
    return NextResponse.json(
      {
        error: 'ANTHROPIC_API_KEY is not configured.',
        hint: 'Set ANTHROPIC_API_KEY in your Vercel project env vars (Settings → Environment Variables) and redeploy.',
      },
      { status: 500 },
    )
  }

  try {
    const supabase = await getDb()

    const { data: submission, error: subErr } = await supabase
      .from('submissions')
      .select('*, subcontractors ( trade )')
      .eq('id', submissionId)
      .single()

    if (subErr || !submission) {
      return NextResponse.json({ error: 'Submission not found', hint: `No submission with id=${submissionId} in the documents table.` }, { status: 404 })
    }

    const { data: documents } = await supabase
      .from('documents')
      .select('*')
      .eq('submission_id', submissionId)

    const docCount = documents?.length ?? 0
    console.log(`[Analysis] Submission ${submissionId} has ${docCount} document(s)`)

    if (docCount === 0) {
      return NextResponse.json(
        {
          error: 'No documents to analyze.',
          hint: 'Upload at least one PDF (ACORD 25, policy, or endorsement) before running analysis.',
          debug: { submission_id: submissionId, document_count: 0 },
        },
        { status: 400 },
      )
    }

    // Gather all accord25 text and all policy/endorsement texts
    let accord25Text = ''
    let policyText: string | null = null
    let docsWithText = 0

    for (const doc of documents ?? []) {
      const docType = doc.doc_type as string
      const text = doc.extracted_text as string | null
      if (!text) continue
      docsWithText += 1

      if (docType === 'accord25') {
        accord25Text = text
      } else if (docType.startsWith('policy') || docType === 'endorsement') {
        const filename = (doc.filename as string) || docType
        policyText = (policyText || '') + '\n\n--- ' + filename + ' ---\n' + text
      }
    }

    console.log(
      `[Analysis] Extracted text — accord25=${accord25Text.length} chars, policy=${policyText?.length ?? 0} chars, docs_with_text=${docsWithText}/${docCount}`,
    )

    if (!accord25Text && !policyText) {
      return NextResponse.json(
        {
          error: 'No extractable text found in any uploaded document.',
          hint: 'PDFs are likely image-based scans. Re-export them as text PDFs (or run them through OCR) and re-upload.',
          debug: { submission_id: submissionId, document_count: docCount, docs_with_text: docsWithText },
        },
        { status: 400 },
      )
    }

    if (!accord25Text) {
      accord25Text = '[PDF text extraction pending]'
    }

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

    const startedAt = Date.now()
    let analysis
    try {
      analysis = await analyzeAccord25(accord25Text, policyText, schedule || null, reviewChecks, submissionId)
    } catch (anthropicErr) {
      const elapsedMs = Date.now() - startedAt
      console.error(`[Analysis] Anthropic call failed after ${elapsedMs}ms:`, anthropicErr)
      const diag = diagnoseError(anthropicErr, {
        submission_id: submissionId,
        document_count: docCount,
        docs_with_text: docsWithText,
        accord25_chars: accord25Text.length,
        policy_chars: policyText?.length ?? 0,
        elapsed_ms: elapsedMs,
      })
      return NextResponse.json(diag, { status: 502 })
    }

    const elapsedMs = Date.now() - startedAt
    console.log(`[Analysis] Anthropic call succeeded in ${elapsedMs}ms`)

    const { error: upsertErr } = await supabase.from('ai_analysis').upsert({
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

    if (upsertErr) {
      console.error('[Analysis] Failed to persist ai_analysis row:', upsertErr)
      return NextResponse.json(
        {
          error: 'Analysis ran successfully but the result could not be saved to the database.',
          hint: 'Check Supabase RLS policies on the ai_analysis table. The error message is in the debug field.',
          debug: { submission_id: submissionId, db_error: upsertErr.message },
        },
        { status: 500 },
      )
    }

    // Flush usage log
    const usageEntries = getAndClearUsageBuffer()
    if (usageEntries.length > 0) {
      const { error: usageErr } = await supabase.from('ai_usage_log').insert(usageEntries)
      if (usageErr) {
        console.error('Failed to log AI usage:', usageErr)
      }
    }

    return NextResponse.json({ success: true, analysis, debug: { elapsed_ms: elapsedMs, document_count: docCount, docs_with_text: docsWithText } })
  } catch (err) {
    console.error('[Analysis] Unexpected error:', err)
    const diag = diagnoseError(err, { submission_id: submissionId })
    return NextResponse.json(diag, { status: 500 })
  }
}
