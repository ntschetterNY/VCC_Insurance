import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createSupabaseAdmin } from '@/lib/supabase'
import { getValidAccessToken } from '@/app/api/procore/route'

// ---------------------------------------------------------------------------
// POST /api/procore/directory
// Push a submission's subcontractor insurance info up to the Procore
// company-level vendor directory. Flow:
//   1. Look up the submission + its AI analysis + expirations.
//   2. Resolve the Procore vendor id:
//        a. If the submission has a procore_contract_id, fetch the commitment
//           and use its vendor.id.
//        b. Otherwise, search the company vendor list for a name match.
//   3. PATCH the vendor with GL / WC / Auto / Umbrella limits + expirations
//      (+ carriers when the AI extracted them).
// ---------------------------------------------------------------------------

interface Submission {
  id: number
  procore_project_id: string | null
  procore_contract_id: string | null
  gl_expiration: string | null
  wc_expiration: string | null
  auto_expiration: string | null
  umbrella_expiration: string | null
  subcontractors: {
    id: number
    name: string
    trade: string | null
  } | null
  ai_analysis: {
    limits_found: Record<string, number | null> | null
    checklist: Record<string, string | null> | null
  } | null
}

export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { submission_id } = (await req.json()) as { submission_id?: number }
    if (!submission_id) {
      return NextResponse.json({ error: 'submission_id is required' }, { status: 400 })
    }

    const admin = createSupabaseAdmin()

    // Pull the submission with joined subcontractor + AI analysis (separate
    // query — supabase-js can't deeply-join a one-to-one table reliably in
    // one round trip when RLS is enabled for the analysis row).
    const { data: submission, error: subErr } = await admin
      .from('submissions')
      .select(
        `id, procore_project_id, procore_contract_id,
         gl_expiration, wc_expiration, auto_expiration, umbrella_expiration,
         subcontractors ( id, name, trade )`,
      )
      .eq('id', submission_id)
      .single()

    if (subErr || !submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
    }

    const { data: analysis } = await admin
      .from('ai_analysis')
      .select('limits_found, checklist')
      .eq('submission_id', submission_id)
      .single()

    const s = submission as unknown as Submission
    s.ai_analysis = (analysis as Submission['ai_analysis']) ?? null

    const subName = s.subcontractors?.name?.trim() ?? ''
    if (!subName) {
      return NextResponse.json({ error: 'Submission has no subcontractor name' }, { status: 400 })
    }

    // Get Procore token
    const tokenResult = await getValidAccessToken()
    if ('error' in tokenResult) {
      return NextResponse.json({ error: tokenResult.error }, { status: 400 })
    }
    const { token, companyId } = tokenResult
    const companyIdInt = parseInt(companyId, 10)
    if (Number.isNaN(companyIdInt)) {
      return NextResponse.json({ error: 'Invalid Procore Company ID' }, { status: 400 })
    }

    // -----------------------------------------------------------------
    // Resolve vendor id
    // -----------------------------------------------------------------
    let vendorId: number | null = null
    let vendorResolution = ''

    if (s.procore_contract_id) {
      try {
        const commitRes = await fetch(
          `https://api.procore.com/rest/v2.0/companies/${companyIdInt}` +
            `/projects/${s.procore_project_id}/commitment_contracts/${s.procore_contract_id}` +
            `?view=extended`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Procore-Company-Id': String(companyIdInt),
              Accept: 'application/json',
            },
          },
        )
        if (commitRes.ok) {
          const commit = (await commitRes.json()) as {
            vendor?: { id?: number | string }
            data?: { vendor?: { id?: number | string } }
          }
          const v = commit.vendor ?? commit.data?.vendor
          if (v?.id != null) {
            vendorId = typeof v.id === 'string' ? parseInt(v.id, 10) : v.id
            vendorResolution = `commitment ${s.procore_contract_id}`
          }
        }
      } catch {
        // fall through to name lookup
      }
    }

    if (!vendorId) {
      // Fallback: search the company vendor directory by name
      try {
        const searchRes = await fetch(
          `https://api.procore.com/rest/v1.0/vendors?company_id=${companyIdInt}` +
            `&filters[search]=${encodeURIComponent(subName)}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Procore-Company-Id': String(companyIdInt),
              Accept: 'application/json',
            },
          },
        )
        if (searchRes.ok) {
          const vendors = (await searchRes.json()) as Array<{ id: number; name: string }>
          const exact = vendors.find((v) => v.name?.toLowerCase() === subName.toLowerCase())
          const match = exact ?? vendors[0]
          if (match?.id) {
            vendorId = match.id
            vendorResolution = `name "${match.name}"`
          }
        }
      } catch {
        // handled below
      }
    }

    if (!vendorId) {
      return NextResponse.json(
        {
          error:
            `Could not find a matching vendor in the Procore directory for "${subName}". ` +
            `Add the vendor in Procore first, or link this submission to a Procore commitment.`,
        },
        { status: 404 },
      )
    }

    // -----------------------------------------------------------------
    // Build vendor payload — only include fields we have data for.
    // -----------------------------------------------------------------
    const limits = s.ai_analysis?.limits_found ?? {}
    const checklist = s.ai_analysis?.checklist ?? {}

    const vendorPayload: Record<string, unknown> = {}

    // General Liability
    if (limits.gl_per_occurrence != null) {
      vendorPayload.general_liability_insurance_amount = limits.gl_per_occurrence
    }
    if (limits.gl_aggregate != null) {
      vendorPayload.general_liability_insurance_policy_amount = limits.gl_aggregate
    }
    if (checklist.gl_carrier) {
      vendorPayload.general_liability_insurance_carrier = checklist.gl_carrier
    }
    if (s.gl_expiration) {
      vendorPayload.general_liability_insurance_expiration_date = s.gl_expiration
    }

    // Workers Comp
    if (limits.workers_comp != null) {
      vendorPayload.workers_compensation_insurance_amount = limits.workers_comp
    }
    if (checklist.wc_carrier) {
      vendorPayload.workers_compensation_insurance_carrier = checklist.wc_carrier
    }
    if (s.wc_expiration) {
      vendorPayload.workers_compensation_insurance_expiration_date = s.wc_expiration
    }

    // Automobile
    if (limits.auto_liability != null) {
      vendorPayload.automobile_insurance_amount = limits.auto_liability
    }
    if (checklist.auto_carrier) {
      vendorPayload.automobile_insurance_carrier = checklist.auto_carrier
    }
    if (s.auto_expiration) {
      vendorPayload.automobile_insurance_expiration_date = s.auto_expiration
    }

    // Umbrella / Excess
    if (limits.umbrella != null) {
      vendorPayload.umbrella_insurance_amount = limits.umbrella
    }
    if (checklist.excess_carrier) {
      vendorPayload.umbrella_insurance_carrier = checklist.excess_carrier
    }
    if (s.umbrella_expiration) {
      vendorPayload.umbrella_insurance_expiration_date = s.umbrella_expiration
    }

    if (Object.keys(vendorPayload).length === 0) {
      return NextResponse.json(
        {
          error:
            'No insurance data to push. Run the AI analysis and/or fill in expiration dates first.',
        },
        { status: 400 },
      )
    }

    // -----------------------------------------------------------------
    // PATCH the vendor
    // -----------------------------------------------------------------
    const patchRes = await fetch(
      `https://api.procore.com/rest/v1.0/vendors/${vendorId}?company_id=${companyIdInt}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Procore-Company-Id': String(companyIdInt),
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ vendor: vendorPayload }),
      },
    )

    if (!patchRes.ok) {
      const errBody = await patchRes.text()
      return NextResponse.json(
        {
          error: `Procore ${patchRes.status}: ${errBody.slice(0, 400)}`,
          vendor_id: vendorId,
        },
        { status: patchRes.status },
      )
    }

    return NextResponse.json({
      success: true,
      vendor_id: vendorId,
      vendor_resolved_by: vendorResolution,
      updated_fields: Object.keys(vendorPayload),
    })
  } catch (err) {
    console.error('Procore directory push error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Directory push failed' },
      { status: 500 },
    )
  }
}
