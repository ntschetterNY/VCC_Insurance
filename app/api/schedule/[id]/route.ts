import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await getDb()
    const body = await req.json() as {
      trade?: string
      schedule_group?: string
      gl_per_occurrence?: number
      gl_aggregate?: number
      workers_comp?: number
      auto_liability?: number
      umbrella?: number
      notes?: string
    }

    const { error } = await supabase
      .from('schedule')
      .update({
        trade: body.trade ?? undefined,
        schedule_group: body.schedule_group ?? undefined,
        gl_per_occurrence: body.gl_per_occurrence ?? null,
        gl_aggregate: body.gl_aggregate ?? null,
        workers_comp: body.workers_comp ?? null,
        auto_liability: body.auto_liability ?? null,
        umbrella: body.umbrella ?? null,
        notes: body.notes ?? null,
      })
      .eq('id', parseInt(params.id))

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to update schedule' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await getDb()
    const { error } = await supabase.from('schedule').delete().eq('id', parseInt(params.id))
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to delete schedule entry' }, { status: 500 })
  }
}
