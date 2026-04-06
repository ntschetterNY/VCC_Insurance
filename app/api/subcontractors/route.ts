import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  try {
    const supabase = await getDb()
    const { data, error } = await supabase
      .from('subcontractors')
      .select('*')
      .order('name')

    if (error) throw error
    return NextResponse.json(data)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to fetch subcontractors' }, { status: 500 })
  }
}
