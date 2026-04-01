import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import path from 'path'
import getDb from '@/lib/db'
import { requireAuth } from '@/lib/auth'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = requireAuth(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = getDb()
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(parseInt(params.id)) as {
    id: number; filename: string; filepath: string; doc_type: string
  } | undefined

  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  const filepath = doc.filepath
  if (!existsSync(filepath)) {
    return NextResponse.json({ error: 'File not found on disk' }, { status: 404 })
  }

  // Safety: ensure the file is within the uploads directory
  const uploadsDir = path.join(process.cwd(), 'uploads')
  const resolvedPath = path.resolve(filepath)
  if (!resolvedPath.startsWith(uploadsDir)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const fileBuffer = readFileSync(resolvedPath)
  const filename = doc.filename || path.basename(resolvedPath)

  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      'Content-Length': String(fileBuffer.length),
    },
  })
}
