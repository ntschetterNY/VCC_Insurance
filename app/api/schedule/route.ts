import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  try {
    const supabase = await getDb()
    const { data, error } = await supabase
      .from('schedule')
      .select('*')
      .order('trade')

    if (error) throw error
    return NextResponse.json(data)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to fetch schedule' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getDb()
    const body = await req.json() as {
      trade: string
      schedule_type?: string | null
      deductible?: number | null
      schedule_group?: string
      gl_per_occurrence?: number
      gl_aggregate?: number
      workers_comp?: number
      auto_liability?: number
      umbrella?: number
      notes?: string
    }

    if (!body.trade) return NextResponse.json({ error: 'Trade is required' }, { status: 400 })

    const { data, error } = await supabase
      .from('schedule')
      .insert({
        trade: body.trade,
        schedule_type: body.schedule_type ?? null,
        deductible: body.deductible ?? null,
        schedule_group: body.schedule_group ?? 'A',
        gl_per_occurrence: body.gl_per_occurrence ?? null,
        gl_aggregate: body.gl_aggregate ?? null,
        workers_comp: body.workers_comp ?? null,
        auto_liability: body.auto_liability ?? null,
        umbrella: body.umbrella ?? null,
        notes: body.notes ?? null,
      })
      .select('id')
      .single()

    if (error) throw error
    return NextResponse.json({ id: data.id }, { status: 201 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to create schedule entry' }, { status: 500 })
  }
}
