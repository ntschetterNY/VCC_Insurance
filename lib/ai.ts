import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// Max characters sent to Claude per document — keeps token usage low
const MAX_ACCORD_CHARS = 8000
const MAX_POLICY_CHARS = 4000

// ---------------------------------------------------------------------------
// Usage logging — records token counts per model / function
// ---------------------------------------------------------------------------
export interface UsageEntry {
  model: string
  function_name: string
  input_tokens: number
  output_tokens: number
  submission_id?: number | null
}

// Buffered in-memory; flushed to DB by callers via getAndClearUsageBuffer()
const usageBuffer: UsageEntry[] = []

function recordUsage(
  model: string,
  functionName: string,
  message: Anthropic.Message,
  submissionId?: number | null,
) {
  usageBuffer.push({
    model,
    function_name: functionName,
    input_tokens: message.usage?.input_tokens ?? 0,
    output_tokens: message.usage?.output_tokens ?? 0,
    submission_id: submissionId ?? null,
  })
}

export function getAndClearUsageBuffer(): UsageEntry[] {
  return usageBuffer.splice(0, usageBuffer.length)
}

// ---------------------------------------------------------------------------
// Document classification types
// ---------------------------------------------------------------------------
export type DocClassification =
  | 'accord25'
  | 'accord28'
  | 'policy_gl'
  | 'policy_excess'
  | 'policy_wc'
  | 'policy_auto'
  | 'endorsement'
  | 'contract'
  | 'other'

export interface ClassificationResult {
  doc_type: DocClassification
  confidence: number
  description: string
}

// ---------------------------------------------------------------------------
// Step 1: Classify document type using Haiku (fast & cheap)
// ---------------------------------------------------------------------------
export async function classifyDocument(
  text: string,
  submissionId?: number,
  classificationHints?: string[],
): Promise<ClassificationResult> {
  const sample = text.slice(0, 2000) // only need first ~2000 chars for classification

  let hintsBlock = ''
  if (classificationHints && classificationHints.length > 0) {
    hintsBlock = `\n\nPrevious classification corrections (use these to improve accuracy):\n${classificationHints.map((h) => `- ${h}`).join('\n')}`
  }

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [{
      role: 'user',
      content: `Classify this insurance document. Return ONLY valid JSON.

Document text (first 2000 chars):
${sample}

Return JSON matching this structure:
{
  "doc_type": "accord25|accord28|policy_gl|policy_excess|policy_wc|policy_auto|endorsement|contract|other",
  "confidence": 0.0 to 1.0,
  "description": "Brief description of the document"
}

Classification rules:
- "accord25": ACORD 25 Certificate of Liability Insurance
- "accord28": ACORD 28 Evidence of Commercial Property Insurance
- "policy_gl": General Liability policy or declarations page
- "policy_excess": Excess/Umbrella policy or declarations page
- "policy_wc": Workers Compensation policy or declarations page
- "policy_auto": Commercial Auto policy or declarations page
- "endorsement": Policy endorsement (CG 20 10, CG 20 37, waiver of subrogation, etc.)
- "contract": Subcontract or agreement document
- "other": Unknown or unrelated document${hintsBlock}`
    }],
  })

  recordUsage('claude-haiku-4-5-20251001', 'classify', message, submissionId)

  const responseText = message.content[0].type === 'text' ? message.content[0].text : ''
  const jsonMatch = responseText.match(/\{[\s\S]*\}/)

  if (!jsonMatch) {
    return { doc_type: 'other', confidence: 0, description: 'Classification failed' }
  }

  try {
    return JSON.parse(jsonMatch[0]) as ClassificationResult
  } catch {
    return { doc_type: 'other', confidence: 0, description: 'Classification parse error' }
  }
}

// ---------------------------------------------------------------------------
// Step 2: Full analysis using Sonnet (deep review)
// ---------------------------------------------------------------------------
export interface ChecklistResult {
  // Contract
  contract_signed: string | null
  contracted_with: string | null
  indemnification: string | null
  ai_premise: string | null
  ai_comp_ops: string | null

  // General Liability
  gl_carrier: string | null
  gl_carrier_rating: string | null
  gl_limits: string | null
  gl_term: string | null
  gl_full_policy: string | null
  cg_20_10: string | null
  cg_20_37: string | null
  pnc: string | null
  wos: string | null
  occ_claims_made: string | null
  per_project_limits: string | null
  defense_in_out: string | null
  action_over_excl: string | null
  subsidence_excl: string | null
  deductible: string | null
  contractual_liability: string | null
  gl_compliant: string | null
  gl_comments: string | null

  // Excess / Umbrella
  excess_carrier: string | null
  excess_limits: string | null
  excess_term: string | null
  excess_full_policy: string | null
  excess_type: string | null
  excess_compliant: string | null
  excess_comments: string | null

  // Commercial Auto
  auto_carrier: string | null
  auto_limits: string | null
  auto_term: string | null
  auto_full_policy: string | null
  auto_comments: string | null

  // Workers Compensation
  wc_carrier: string | null
  wc_limits: string | null
  wc_term: string | null
  wc_full_policy: string | null
  wc_comments: string | null
}

export interface AnalysisResult {
  cg_numbers: string[]
  limits_found: {
    gl_per_occurrence?: number
    gl_aggregate?: number
    workers_comp?: number
    auto_liability?: number
    umbrella?: number
  }
  limits_met: boolean
  issues: string[]
  flags: string[]
  checklist: ChecklistResult
  doc_classification?: ClassificationResult
}

const CHECKLIST_PROMPT = `You are an expert insurance compliance reviewer for a construction company. Analyze the submitted insurance documents against the following comprehensive review checklist. Extract every piece of information you can find.

## INSURANCE REVIEW CHECKLIST

Review the documents for ALL of the following categories and fields:

### CONTRACT REVIEW
- **contract_signed**: Is the contract signed? (Y/N/Unknown)
- **contracted_with**: Who is the contract with? (entity name)
- **indemnification**: Does the contract contain indemnification language? (Y/N/Unknown)
- **ai_premise**: Additional Insured - Premises coverage present? (Y/N/Unknown)
- **ai_comp_ops**: Additional Insured - Completed Operations coverage present? (Y/N/Unknown)

### GENERAL LIABILITY
- **gl_carrier**: Name of the General Liability insurance carrier
- **gl_carrier_rating**: AM Best rating of the carrier (e.g., "A- XIV", "A+ XV")
- **gl_limits**: GL limits in shorthand format (e.g., "1/2/2/1" = $1M per occ / $2M general agg / $2M products agg / $1M personal injury)
- **gl_term**: Policy term dates (e.g., "10/15/2024 - 10/15/2025")
- **gl_full_policy**: Was a full policy submitted? (Y/N/Unknown)
- **cg_20_10**: CG 20 10 Additional Insured endorsement present? Include edition date if found (e.g., "Yes via CG 20 10 12 19")
- **cg_20_37**: CG 20 37 Additional Insured - Completed Operations endorsement present? Include edition date if found
- **pnc**: Primary and Non-Contributory endorsement present? (Y/N/Unknown)
- **wos**: Waiver of Subrogation endorsement present? (Y/N/Unknown)
- **occ_claims_made**: Is the policy Occurrence or Claims Made based?
- **per_project_limits**: Are there per-project aggregate limits? (Y/N/Unknown)
- **defense_in_out**: Is defense inside or outside the limits? (In/Out/Unknown)
- **action_over_excl**: Is there an Action Over Exclusion? (Y/N/Unknown)
- **subsidence_excl**: Is there a Subsidence Exclusion? (Y/N/Unknown)
- **deductible**: Deductible amount if any (e.g., "$5,000" or "None")
- **contractual_liability**: Is Contractual Liability coverage included? (Y/N/Unknown)
- **gl_compliant**: Overall, is the GL coverage compliant with requirements? (Y/N)
- **gl_comments**: Any additional GL observations, concerns, or notes

### EXCESS / UMBRELLA
- **excess_carrier**: Name of the Excess/Umbrella insurance carrier
- **excess_limits**: Excess/Umbrella limit amount (e.g., "$5M")
- **excess_term**: Policy term dates
- **excess_full_policy**: Was a full excess policy submitted? (Y/N/Unknown)
- **excess_type**: Is it an Excess or Umbrella policy?
- **excess_compliant**: Is the Excess/Umbrella coverage compliant? (Y/N)
- **excess_comments**: Any additional Excess/Umbrella observations or notes

### COMMERCIAL AUTO
- **auto_carrier**: Name of the Commercial Auto insurance carrier
- **auto_limits**: Auto liability limits (e.g., "$1M CSL" or "$1M/$1M/$1M")
- **auto_term**: Policy term dates
- **auto_full_policy**: Was a full auto policy submitted? (Y/N/Unknown)
- **auto_comments**: Any additional auto observations or notes

### WORKERS COMPENSATION
- **wc_carrier**: Name of the WC insurance carrier
- **wc_limits**: WC limits (e.g., "$1M/$1M/$1M" = Each Accident / Disease-Policy Limit / Disease-Each Employee)
- **wc_term**: Policy term dates
- **wc_full_policy**: Was a full WC policy submitted? (Y/N/Unknown)
- **wc_comments**: Any additional WC observations or notes

## COMPLIANCE FLAGS
Also identify:
- Any policies that are expired or expiring within 30 days
- Missing required endorsements (CG 20 10, CG 20 37, PNC, WOS)
- Limits that do not meet requirements
- Any carrier with a rating below A- (AM Best)
- Missing documents (e.g., full policy not provided, excess policy not submitted)
- Any exclusions that could be problematic for construction work
- Whether renewal policies are needed`

export async function analyzeAccord25(
  text: string,
  policyText: string | null,
  scheduleRequirements: {
    trade?: string
    gl_per_occurrence?: number
    gl_aggregate?: number
    workers_comp?: number
    auto_liability?: number
    umbrella?: number
    notes?: string
  } | null,
  reviewChecks?: { title: string; description: string }[],
  submissionId?: number,
): Promise<AnalysisResult> {
  const accord25 = text.slice(0, MAX_ACCORD_CHARS)
  const policy = policyText ? policyText.slice(0, MAX_POLICY_CHARS) : null

  // Step 1: Classify with Haiku (fast)
  const classification = await classifyDocument(text, submissionId)

  // Step 2: Deep analysis with Sonnet
  const req = scheduleRequirements
    ? `REQUIREMENTS (${scheduleRequirements.trade ?? 'Unknown'}): GL/occ $${scheduleRequirements.gl_per_occurrence ?? 0} GL/agg $${scheduleRequirements.gl_aggregate ?? 0} WC $${scheduleRequirements.workers_comp ?? 0} Auto $${scheduleRequirements.auto_liability ?? 0} Umbrella $${scheduleRequirements.umbrella ?? 0}${scheduleRequirements.notes ? ` Notes: ${scheduleRequirements.notes}` : ''}`
    : 'REQUIREMENTS: Apply general industry standards.'

  // Build custom review checks section
  let customChecksPrompt = ''
  if (reviewChecks && reviewChecks.length > 0) {
    customChecksPrompt = `\n\n## CUSTOM REVIEW CHECKS\nIn addition to the standard checklist above, specifically check for and report on the following items. Include findings for each in the "custom_checks" field of your response:\n`
    reviewChecks.forEach((check, i) => {
      customChecksPrompt += `${i + 1}. **${check.title}**: ${check.description}\n`
    })
  }

  const docs = policy
    ? `ACCORD 25:\n${accord25}\n\nPOLICY (excerpt):\n${policy}`
    : `ACCORD 25:\n${accord25}`

  const customChecksJson = reviewChecks && reviewChecks.length > 0
    ? `,\n  "custom_checks": {\n${reviewChecks.map(c => `    "${c.title.replace(/"/g, '\\"')}": null`).join(',\n')}\n  }`
    : ''

  const prompt = `${CHECKLIST_PROMPT}${customChecksPrompt}

Document was classified as: ${classification.doc_type} (${classification.description})

${req}

${docs}

Return ONLY valid JSON matching this exact structure (use null for fields you cannot determine):
{
  "cg_numbers": [],
  "limits_found": {
    "gl_per_occurrence": null,
    "gl_aggregate": null,
    "workers_comp": null,
    "auto_liability": null,
    "umbrella": null
  },
  "limits_met": false,
  "issues": [],
  "flags": [],
  "checklist": {
    "contract_signed": null,
    "contracted_with": null,
    "indemnification": null,
    "ai_premise": null,
    "ai_comp_ops": null,
    "gl_carrier": null,
    "gl_carrier_rating": null,
    "gl_limits": null,
    "gl_term": null,
    "gl_full_policy": null,
    "cg_20_10": null,
    "cg_20_37": null,
    "pnc": null,
    "wos": null,
    "occ_claims_made": null,
    "per_project_limits": null,
    "defense_in_out": null,
    "action_over_excl": null,
    "subsidence_excl": null,
    "deductible": null,
    "contractual_liability": null,
    "gl_compliant": null,
    "gl_comments": null,
    "excess_carrier": null,
    "excess_limits": null,
    "excess_term": null,
    "excess_full_policy": null,
    "excess_type": null,
    "excess_compliant": null,
    "excess_comments": null,
    "auto_carrier": null,
    "auto_limits": null,
    "auto_term": null,
    "auto_full_policy": null,
    "auto_comments": null,
    "wc_carrier": null,
    "wc_limits": null,
    "wc_term": null,
    "wc_full_policy": null,
    "wc_comments": null
  }${customChecksJson}
}`

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  })

  recordUsage('claude-sonnet-4-20250514', 'analyze', message, submissionId)

  const responseText = message.content[0].type === 'text' ? message.content[0].text : ''

  const jsonMatch = responseText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('No valid JSON found in AI response')
  }

  const parsed = JSON.parse(jsonMatch[0])

  // Ensure checklist field exists with defaults
  if (!parsed.checklist) {
    parsed.checklist = {}
  }

  // Attach classification result
  parsed.doc_classification = classification

  return parsed as AnalysisResult
}
