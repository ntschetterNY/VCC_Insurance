import { NextResponse } from 'next/server'
import getDb from '@/lib/db'

export async function GET() {
  try {
    const db = getDb()
    const submissions = db.prepare(`
      SELECT
        s.id,
        s.status,
        s.uploaded_at,
        s.reviewed_at,
        sub.name AS sub_name,
        sub.trade,
        sub.tier
      FROM submissions s
      JOIN subcontractors sub ON sub.id = s.sub_id
      ORDER BY s.uploaded_at DESC
    `).all()
    return NextResponse.json(submissions)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to fetch submissions' }, { status: 500 })
  }
}
