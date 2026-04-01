import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

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
  const requirementsSection = scheduleRequirements
    ? `
SCHEDULE OF REQUIREMENTS FOR THIS TRADE (${scheduleRequirements.trade || 'Unknown Trade'}):
- GL Per Occurrence: $${(scheduleRequirements.gl_per_occurrence || 0).toLocaleString()}
- GL Aggregate: $${(scheduleRequirements.gl_aggregate || 0).toLocaleString()}
- Workers Compensation: $${(scheduleRequirements.workers_comp || 0).toLocaleString()}
- Auto Liability: $${(scheduleRequirements.auto_liability || 0).toLocaleString()}
- Umbrella/Excess: $${(scheduleRequirements.umbrella || 0).toLocaleString()}
${scheduleRequirements.notes ? `- Notes: ${scheduleRequirements.notes}` : ''}
`
    : 'No specific schedule requirements provided. Apply general industry standards.'

  const combinedText = policyText
    ? `ACCORD 25 CERTIFICATE:\n${text}\n\nFULL POLICY DOCUMENT:\n${policyText}`
    : `ACCORD 25 CERTIFICATE:\n${text}`

  const prompt = `You are an insurance compliance expert reviewing subcontractor insurance documents for a construction company.

Analyze the following insurance document(s) and extract all relevant information.

${requirementsSection}

DOCUMENT(S) TO ANALYZE:
${combinedText}

Please extract and analyze:
1. All CG (Commercial General Liability) policy numbers - these typically appear as "CG" followed by alphanumeric characters
2. All insurance limits found in the documents:
   - Commercial General Liability per occurrence limit
   - Commercial General Liability aggregate limit
   - Workers Compensation limit
   - Auto Liability limit
   - Umbrella/Excess Liability limit
3. Whether the found limits meet the schedule requirements (if provided)
4. Any issues found (expired dates, missing required coverages, limits below requirements, missing additional insured endorsements, etc.)
5. Any flags or concerns (common exclusions, suspicious entries, non-standard language, etc.)

Return ONLY a valid JSON object with this exact structure:
{
  "cg_numbers": ["list of CG policy numbers found"],
  "limits_found": {
    "gl_per_occurrence": <number or null>,
    "gl_aggregate": <number or null>,
    "workers_comp": <number or null>,
    "auto_liability": <number or null>,
    "umbrella": <number or null>
  },
  "limits_met": <true or false>,
  "issues": ["list of specific issues found"],
  "flags": ["list of flags or concerns"]
}

Return only the JSON, no other text.`

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  })

  const responseText = message.content[0].type === 'text' ? message.content[0].text : ''

  // Parse JSON from response
  const jsonMatch = responseText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('No valid JSON found in AI response')
  }

  const result = JSON.parse(jsonMatch[0]) as AnalysisResult
  return result
}
