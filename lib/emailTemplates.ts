/**
 * Email templates for insurance expiration reminders sent to subcontractors.
 * Content mirrors the language typical of Procore email communication so the
 * template can be dispatched via the Procore Emails tool or an external
 * mail client (mailto:) as a fallback.
 */

export interface ExpirationEmailInput {
  sub_name: string
  trade: string
  tier: 'primary' | 'second' | string
  project_name: string | null
  expiring_policies: Array<{
    policy_type: 'gl' | 'wc' | 'auto' | 'umbrella'
    expires_on: string
    days_until: number
  }>
  sender_name?: string
  company_name?: string
}

function policyLabel(type: string) {
  switch (type) {
    case 'gl': return 'General Liability'
    case 'wc': return 'Workers Compensation'
    case 'auto': return 'Auto Liability'
    case 'umbrella': return 'Umbrella / Excess Liability'
    default: return type.toUpperCase()
  }
}

function formatDate(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export function buildExpirationEmail(input: ExpirationEmailInput): { subject: string; body: string } {
  const sender = input.sender_name ?? 'VCC Insurance Team'
  const company = input.company_name ?? 'VCC'
  const tierLabel = input.tier === 'second'
    ? 'second-tier subcontractor'
    : 'subcontractor'

  const soonest = input.expiring_policies.reduce(
    (min, p) => (p.days_until < min ? p.days_until : min),
    Number.POSITIVE_INFINITY
  )

  let status: string
  if (soonest < 0) status = 'expired'
  else if (soonest <= 7) status = 'expiring within 7 days'
  else if (soonest <= 30) status = 'expiring within 30 days'
  else status = 'expiring soon'

  const subject = `Action Required — Insurance ${status} for ${input.sub_name}${input.project_name ? ' — ' + input.project_name : ''}`

  const lines: string[] = []
  lines.push(`Hello ${input.sub_name} team,`)
  lines.push('')
  lines.push(
    `Our records show that one or more of your insurance policies on file with ${company} ${soonest < 0 ? 'have expired' : 'are expiring soon'}.`
  )
  if (input.tier === 'second') {
    lines.push(
      `This notice applies to your coverage as a second-tier subcontractor. Please also confirm that any of your own lower-tier subs remain in compliance.`
    )
  }
  lines.push('')
  if (input.project_name) {
    lines.push(`Project: ${input.project_name}`)
  }
  lines.push(`Trade: ${input.trade || 'N/A'}`)
  lines.push(`Classification: ${tierLabel}`)
  lines.push('')
  lines.push('Expiring policies:')
  for (const p of input.expiring_policies) {
    const label = policyLabel(p.policy_type)
    const when = p.days_until < 0
      ? `expired ${Math.abs(p.days_until)} day${Math.abs(p.days_until) === 1 ? '' : 's'} ago`
      : p.days_until === 0
      ? 'expires today'
      : `expires in ${p.days_until} day${p.days_until === 1 ? '' : 's'}`
    lines.push(`  • ${label} — ${formatDate(p.expires_on)} (${when})`)
  }
  lines.push('')
  lines.push('Please provide an updated Certificate of Insurance (ACORD 25) and any applicable endorsements at your earliest convenience. Delayed submission may result in a stop-work notice on affected scopes.')
  lines.push('')
  lines.push('Reply to this email with the renewed COI attached, or upload directly to Procore.')
  lines.push('')
  lines.push('Thank you,')
  lines.push(sender)
  lines.push(company)

  return { subject, body: lines.join('\n') }
}
