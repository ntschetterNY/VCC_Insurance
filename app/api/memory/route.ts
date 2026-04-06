import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  try {
    const supabase = await getDb()
    const { data, error } = await supabase
      .from('memory')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json(data)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to fetch memory' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getDb()
    const body = await req.json() as {
      title: string
      description?: string
      category?: string
      severity?: string
    }

    if (!body.title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })

    const { data, error } = await supabase
      .from('memory')
      .insert({
        title: body.title,
        description: body.description ?? null,
        category: body.category ?? 'Watch Item',
        severity: body.severity ?? 'medium',
      })
      .select('id')
      .single()

    if (error) throw error
    return NextResponse.json({ id: data.id }, { status: 201 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to create memory entry' }, { status: 500 })
  }
}
