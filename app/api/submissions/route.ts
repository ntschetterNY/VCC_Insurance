import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  try {
    const supabase = await getDb()
    const { data: submissions, error } = await supabase
      .from('submissions')
      .select(`
        id, status, uploaded_at, reviewed_at,
        procore_project_id, procore_contract_id, project_id,
        subcontractors ( name, trade, tier )
      `)
      .order('uploaded_at', { ascending: false })

    if (error) throw error

    // Flatten the joined subcontractor data. Expose the Procore linkage
    // fields so the dashboard can group second-tier subs under their
    // primary (both share the same procore_contract_id when a commitment
    // is selected on upload).
    const result = (submissions ?? []).map((s: Record<string, unknown>) => {
      const sub = s.subcontractors as Record<string, unknown> | null
      return {
        id: s.id,
        status: s.status,
        uploaded_at: s.uploaded_at,
        reviewed_at: s.reviewed_at,
        sub_name: sub?.name ?? '',
        trade: sub?.trade ?? '',
        tier: sub?.tier ?? '',
        procore_project_id: s.procore_project_id ?? null,
        procore_contract_id: s.procore_contract_id ?? null,
        project_id: s.project_id ?? null,
      }
    })

    return NextResponse.json(result)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to fetch submissions' }, { status: 500 })
  }
}
