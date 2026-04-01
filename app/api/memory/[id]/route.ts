import { NextRequest, NextResponse } from 'next/server'
import getDb from '@/lib/db'

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const db = getDb()
    db.prepare('DELETE FROM memory WHERE id = ?').run(parseInt(params.id))
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to delete memory entry' }, { status: 500 })
  }
}
