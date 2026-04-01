import { NextResponse } from 'next/server'
import getDb from '@/lib/db'

export async function GET() {
  try {
    const db = getDb()
    const subs = db.prepare('SELECT * FROM subcontractors ORDER BY name ASC').all()
    return NextResponse.json(subs)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to fetch subcontractors' }, { status: 500 })
  }
}
