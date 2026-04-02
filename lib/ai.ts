import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// Max characters sent to Claude per document — keeps token usage low
const MAX_ACCORD_CHARS = 4000
const MAX_POLICY_CHARS = 2000

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
}

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
  } | null
): Promise<AnalysisResult> {
  // Truncate to reduce tokens — Accord 25 certs are short; extra text is noise
  const accord25 = text.slice(0, MAX_ACCORD_CHARS)
  const policy = policyText ? policyText.slice(0, MAX_POLICY_CHARS) : null

  const req = scheduleRequirements
    ? `REQUIREMENTS (${scheduleRequirements.trade ?? 'Unknown'}): GL/occ $${scheduleRequirements.gl_per_occurrence ?? 0} GL/agg $${scheduleRequirements.gl_aggregate ?? 0} WC $${scheduleRequirements.workers_comp ?? 0} Auto $${scheduleRequirements.auto_liability ?? 0} Umbrella $${scheduleRequirements.umbrella ?? 0}${scheduleRequirements.notes ? ` Notes: ${scheduleRequirements.notes}` : ''}`
    : 'REQUIREMENTS: Apply general industry standards.'

  const docs = policy
    ? `ACCORD 25:\n${accord25}\n\nPOLICY (excerpt):\n${policy}`
    : `ACCORD 25:\n${accord25}`

  const prompt = `Insurance compliance review. Extract data from these docs and return JSON only.

${req}

${docs}

Return ONLY valid JSON:
{"cg_numbers":[],"limits_found":{"gl_per_occurrence":null,"gl_aggregate":null,"workers_comp":null,"auto_liability":null,"umbrella":null},"limits_met":false,"issues":[],"flags":[]}`

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  })

  const responseText = message.content[0].type === 'text' ? message.content[0].text : ''

  const jsonMatch = responseText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('No valid JSON found in AI response')
  }

  return JSON.parse(jsonMatch[0]) as AnalysisResult
}
