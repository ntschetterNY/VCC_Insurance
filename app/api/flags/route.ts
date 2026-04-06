import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const supabase = await getDb()
    const body = await req.json() as {
      submission_id: number
      flag_type: string
      description: string
      severity: string
    }

    if (!body.submission_id || !body.description) {
      return NextResponse.json({ error: 'submission_id and description are required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('reviewer_flags')
      .insert({
        submission_id: body.submission_id,
        flag_type: body.flag_type || 'general',
        description: body.description,
        severity: body.severity || 'medium',
      })
      .select('id')
      .single()

    if (error) throw error
    return NextResponse.json({ id: data.id }, { status: 201 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to create flag' }, { status: 500 })
  }
}
