import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { requireAuth } from '@/lib/auth'

const VALID_DOC_TYPES = [
  'accord25',
  'accord28',
  'policy_gl',
  'policy_excess',
  'policy_wc',
  'policy_auto',
  'endorsement',
  'contract',
  'other',
]

const DOC_TYPE_LABELS: Record<string, string> = {
  accord25: 'Accord 25',
  accord28: 'Accord 28',
  policy_gl: 'GL Policy',
  policy_excess: 'UM Policy',
  policy_wc: 'WC Policy',
  policy_auto: 'Auto Policy',
  endorsement: 'Endorsements',
  contract: 'Contract',
  other: 'Other',
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const supabase = await getDb()
    const id = parseInt(params.id)
    const body = await req.json() as { doc_type?: string }

    if (!body.doc_type || !VALID_DOC_TYPES.includes(body.doc_type)) {
      return NextResponse.json({ error: 'Invalid document type' }, { status: 400 })
    }

    // Fetch the current document to record the reclassification
    const { data: doc } = await supabase
      .from('documents')
      .select('doc_type, filename')
      .eq('id', id)
      .single()

    const oldType = doc?.doc_type as string | undefined
    const filename = (doc?.filename as string) || 'unknown'

    const { error } = await supabase
      .from('documents')
      .update({ doc_type: body.doc_type })
      .eq('id', id)

    if (error) throw error

    // Save a memory entry when a doc type is manually corrected so the AI
    // classifier can learn from it in future reviews
    if (oldType && oldType !== body.doc_type) {
      const oldLabel = DOC_TYPE_LABELS[oldType] || oldType
      const newLabel = DOC_TYPE_LABELS[body.doc_type] || body.doc_type
      await supabase.from('memory').insert({
        title: `Reclassified "${filename}" from ${oldLabel} to ${newLabel}`,
        description: `A document named "${filename}" was originally classified as "${oldLabel}" but was manually corrected to "${newLabel}". Consider this pattern when classifying similar documents in the future.`,
        category: 'Classification Rule',
        severity: 'low',
      }).then(({ error: memErr }) => {
        if (memErr) console.error('Failed to save classification memory:', memErr)
      })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Failed to update document:', err)
    return NextResponse.json({ error: 'Failed to update document' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const supabase = await getDb()
    const id = parseInt(params.id)

    // Get the storage path before deleting
    const { data: doc, error: fetchErr } = await supabase
      .from('documents')
      .select('storage_path')
      .eq('id', id)
      .single()

    if (fetchErr || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Delete the database record
    const { error } = await supabase.from('documents').delete().eq('id', id)
    if (error) throw error

    // Remove file from Supabase Storage
    const storagePath = doc.storage_path as string
    if (storagePath) {
      await supabase.storage.from('documents').remove([storagePath])
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Failed to delete document:', err)
    return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 })
  }
}
