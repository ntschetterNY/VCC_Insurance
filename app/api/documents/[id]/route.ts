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

    const { error } = await supabase
      .from('documents')
      .update({ doc_type: body.doc_type })
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Failed to update document:', err)
    return NextResponse.json({ error: 'Failed to update document' }, { status: 500 })
  }
}
