import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await getDb()
    const body = await req.json() as { active?: boolean }
    const updates: Record<string, unknown> = {}
    if (typeof body.active === 'boolean') updates.active = body.active

    const { error } = await supabase.from('memory').update(updates).eq('id', parseInt(params.id))
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to update memory entry' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await getDb()
    const { error } = await supabase.from('memory').delete().eq('id', parseInt(params.id))
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to delete memory entry' }, { status: 500 })
  }
}
