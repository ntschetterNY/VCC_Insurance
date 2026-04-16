import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createSupabaseAdmin } from '@/lib/supabase'
import { buildExpirationEmail } from '@/lib/emailTemplates'

interface SubmissionFull {
  id: number
  project_id: number | null
  subcontractor_email: string | null
  gl_expiration: string | null
  wc_expiration: string | null
  auto_expiration: string | null
  umbrella_expiration: string | null
  sub_id: number
  subcontractors: { id: number; name: string; trade: string | null; tier: string | null } | null
  projects: { id: number; name: string } | null
}

function daysUntil(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.floor((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

// POST — generate an expiration-reminder email for a given submission.
// Body: { submission_id: number, to_email?: string }
export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { submission_id?: number; to_email?: string }
  if (!body.submission_id) {
    return NextResponse.json({ error: 'submission_id is required' }, { status: 400 })
  }

  const admin = createSupabaseAdmin()
  const { data: sub } = await admin
    .from('submissions')
    .select(`
      id, project_id, subcontractor_email, gl_expiration, wc_expiration,
      auto_expiration, umbrella_expiration, sub_id,
      subcontractors ( id, name, trade, tier ),
      projects ( id, name )
    `)
    .eq('id', body.submission_id)
    .single()

  if (!sub) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })

  const s = sub as unknown as SubmissionFull
  const expiring: Array<{ policy_type: 'gl' | 'wc' | 'auto' | 'umbrella'; expires_on: string; days_until: number }> = []
  const cols: Array<['gl' | 'wc' | 'auto' | 'umbrella', string | null]> = [
    ['gl', s.gl_expiration],
    ['wc', s.wc_expiration],
    ['auto', s.auto_expiration],
    ['umbrella', s.umbrella_expiration],
  ]
  for (const [type, date] of cols) {
    if (!date) continue
    const days = daysUntil(date)
    if (days <= 60) {
      expiring.push({ policy_type: type, expires_on: date, days_until: days })
    }
  }

  if (expiring.length === 0) {
    return NextResponse.json({
      error: 'No policies expiring in the next 60 days. Update the submission expiration dates first.',
    }, { status: 400 })
  }

  const { subject, body: emailBody } = buildExpirationEmail({
    sub_name: s.subcontractors?.name ?? 'Subcontractor',
    trade: s.subcontractors?.trade ?? '',
    tier: (s.subcontractors?.tier ?? 'primary') as 'primary' | 'second',
    project_name: s.projects?.name ?? null,
    expiring_policies: expiring,
    sender_name: user.name,
    company_name: 'VCC',
  })

  return NextResponse.json({
    submission_id: s.id,
    sub_id: s.sub_id,
    project_id: s.project_id,
    to_email: body.to_email ?? s.subcontractor_email ?? '',
    subject,
    body: emailBody,
    expiring_policies: expiring,
  })
}
