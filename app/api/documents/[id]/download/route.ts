import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { requireAuth } from '@/lib/auth'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await getDb()
  const { data: doc, error } = await supabase
    .from('documents')
    .select('*')
    .eq('id', parseInt(params.id))
    .single()

  if (error || !doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  const storagePath = doc.storage_path as string
  if (!storagePath) {
    return NextResponse.json({ error: 'File not available' }, { status: 404 })
  }

  // Download from Supabase Storage
  const { data: fileData, error: downloadError } = await supabase.storage
    .from('documents')
    .download(storagePath)

  if (downloadError || !fileData) {
    return NextResponse.json({ error: 'File not found in storage' }, { status: 404 })
  }

  const buffer = Buffer.from(await fileData.arrayBuffer())
  const filename = (doc.filename as string) || 'document.pdf'

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      'Content-Length': String(buffer.length),
    },
  })
}
