import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  try {
    const supabase = await getDb()
    const { data: submissions, error } = await supabase
      .from('submissions')
      .select(`
        id, status, uploaded_at, reviewed_at,
        subcontractors ( name, trade, tier )
      `)
      .order('uploaded_at', { ascending: false })

    if (error) throw error

    // Flatten the joined subcontractor data
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
      }
    })

    return NextResponse.json(result)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to fetch submissions' }, { status: 500 })
  }
}
