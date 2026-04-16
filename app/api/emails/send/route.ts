import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createSupabaseAdmin } from '@/lib/supabase'
import { sanitizeString, isValidEmail } from '@/lib/security'
import { getValidAccessToken } from '@/app/api/procore/route'

/**
 * POST /api/emails/send
 * Body: {
 *   submission_id?: number, subcontractor_id?: number, project_id?: number,
 *   to_email: string, cc_emails?: string, subject: string, body: string,
 *   delivery_method: 'procore' | 'mailto' | 'draft'
 * }
 *
 * - `procore`: attempts to dispatch through the Procore Emails tool
 *   (POST /rest/v1.0/projects/:project_id/emails). On success we persist the
 *   Procore email id and mark status = 'sent'.
 * - `mailto`: records the email as "sent" from the user's desktop mail client
 *   (the client generates the mailto: link). No network call is made.
 * - `draft`: just saves the draft for later review.
 */
export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    submission_id?: number
    subcontractor_id?: number
    project_id?: number
    to_email: string
    cc_emails?: string
    subject: string
    body: string
    delivery_method?: 'procore' | 'mailto' | 'draft'
    email_type?: 'expiration' | 'collection' | 'approval' | 'other'
  }

  const toEmail = sanitizeString(body.to_email ?? '')
  const subject = sanitizeString(body.subject ?? '')
  const emailBody = body.body ?? ''
  const deliveryMethod = body.delivery_method ?? 'draft'
  const emailType = body.email_type ?? 'expiration'

  if (!subject || !emailBody) {
    return NextResponse.json({ error: 'Subject and body are required' }, { status: 400 })
  }
  if (deliveryMethod !== 'draft' && !toEmail) {
    return NextResponse.json({ error: 'to_email is required' }, { status: 400 })
  }
  if (toEmail && !isValidEmail(toEmail)) {
    return NextResponse.json({ error: 'Invalid to_email' }, { status: 400 })
  }

  const admin = createSupabaseAdmin()

  // Create the log row up-front so we have an id to reference on failure
  const { data: logRow, error: logErr } = await admin
    .from('email_log')
    .insert({
      submission_id: body.submission_id ?? null,
      subcontractor_id: body.subcontractor_id ?? null,
      project_id: body.project_id ?? null,
      to_email: toEmail,
      cc_emails: body.cc_emails ? sanitizeString(body.cc_emails) : null,
      subject,
      body: emailBody,
      email_type: emailType,
      delivery_method: deliveryMethod,
      status: deliveryMethod === 'draft' ? 'draft' : 'sent',
      sent_by: user.id,
      sent_at: deliveryMethod === 'draft' ? null : new Date().toISOString(),
    })
    .select('*')
    .single()

  if (logErr || !logRow) {
    return NextResponse.json({ error: logErr?.message ?? 'Failed to log email' }, { status: 500 })
  }

  if (deliveryMethod === 'procore') {
    if (!body.project_id) {
      await admin.from('email_log').update({
        status: 'failed',
        error_detail: 'Procore delivery requires project_id',
      }).eq('id', logRow.id)
      return NextResponse.json({ error: 'project_id is required for Procore delivery' }, { status: 400 })
    }

    // Look up the Procore project id for this local project
    const { data: project } = await admin
      .from('projects')
      .select('procore_project_id, name')
      .eq('id', body.project_id)
      .single()

    if (!project?.procore_project_id) {
      await admin.from('email_log').update({
        status: 'failed',
        error_detail: 'Project is not linked to a Procore project',
      }).eq('id', logRow.id)
      return NextResponse.json({
        id: logRow.id,
        status: 'failed',
        error: 'Project is not linked to a Procore project. Link a procore_project_id on the project or use "mailto" delivery.',
      }, { status: 400 })
    }

    const tokenResult = await getValidAccessToken()
    if ('error' in tokenResult) {
      await admin.from('email_log').update({
        status: 'failed',
        error_detail: tokenResult.error,
      }).eq('id', logRow.id)
      return NextResponse.json({ id: logRow.id, status: 'failed', error: tokenResult.error }, { status: 400 })
    }

    const ccAddresses = (body.cc_emails ?? '')
      .split(/[,;]/)
      .map((e) => e.trim())
      .filter(Boolean)

    // Procore "Emails" tool endpoint:
    //   POST /rest/v1.0/projects/{project_id}/emails
    //   payload shape varies by API version; we use the v1.0 emails payload.
    const endpoint = `https://api.procore.com/rest/v1.0/projects/${encodeURIComponent(project.procore_project_id)}/emails`
    const payload = {
      email: {
        subject,
        body: emailBody,
        to_addresses: [toEmail],
        cc_addresses: ccAddresses,
      },
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenResult.token}`,
          'Procore-Company-Id': tokenResult.companyId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const errBody = await res.text()
        await admin.from('email_log').update({
          status: 'failed',
          error_detail: `Procore ${res.status}: ${errBody.slice(0, 500)}`,
        }).eq('id', logRow.id)
        return NextResponse.json({
          id: logRow.id,
          status: 'failed',
          error: `Procore email API returned ${res.status}. ${errBody.slice(0, 200)}`,
        }, { status: res.status })
      }

      let procoreEmailId: string | null = null
      try {
        const json = await res.json() as { id?: number | string }
        if (json?.id !== undefined) procoreEmailId = String(json.id)
      } catch { /* ignore */ }

      await admin.from('email_log').update({
        status: 'sent',
        procore_email_id: procoreEmailId,
        sent_at: new Date().toISOString(),
      }).eq('id', logRow.id)

      return NextResponse.json({
        id: logRow.id,
        status: 'sent',
        procore_email_id: procoreEmailId,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await admin.from('email_log').update({ status: 'failed', error_detail: msg }).eq('id', logRow.id)
      return NextResponse.json({ id: logRow.id, status: 'failed', error: msg }, { status: 500 })
    }
  }

  // `mailto` and `draft` both resolve here
  return NextResponse.json({ id: logRow.id, status: logRow.status })
}
