import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { classifyDocument } from '@/lib/ai'
import pdfParse from 'pdf-parse'

async function extractTextFromBuffer(buffer: Buffer, maxChars = 8000): Promise<string> {
  try {
    const data = await pdfParse(buffer)
    return data.text.slice(0, maxChars)
  } catch (err) {
    console.error('PDF text extraction failed:', err)
    return ''
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const submissionId = parseInt(params.id)
    const supabase = await getDb()

    // Verify submission exists
    const { data: submission, error: subErr } = await supabase
      .from('submissions')
      .select('id')
      .eq('id', submissionId)
      .single()

    if (subErr || !submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
    }

    const formData = await request.formData()
    const uploadedFiles = formData.getAll('files') as File[]

    let manualDocTypes: Record<string, string> = {}
    const docTypesJson = formData.get('doc_types') as string | null
    if (docTypesJson) {
      try {
        manualDocTypes = JSON.parse(docTypesJson)
      } catch {
        console.warn('[Documents] Failed to parse doc_types JSON')
      }
    }

    if (uploadedFiles.length === 0) {
      return NextResponse.json({ error: 'At least one PDF file is required' }, { status: 400 })
    }

    const addedDocs: { id: number; filename: string; doc_type: string }[] = []

    for (const file of uploadedFiles) {
      const buffer = Buffer.from(await file.arrayBuffer())
      const text = await extractTextFromBuffer(buffer)

      // Classify — use manual type if provided, otherwise AI classify
      let docType = 'other'
      const manualType = manualDocTypes[file.name]
      if (manualType) {
        docType = manualType
      } else if (text && text.trim().length >= 20) {
        try {
          const classification = await classifyDocument(text, submissionId)
          docType = classification.doc_type
        } catch (err) {
          console.error(`[Documents] Classification failed for "${file.name}":`, err)
        }
      }

      // Upload to Supabase Storage
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const storagePath = `${submissionId}/${docType}_${safeName}`

      await supabase.storage.from('documents').upload(storagePath, buffer, {
        contentType: 'application/pdf',
      })

      // Insert document record
      const { data: doc } = await supabase.from('documents').insert({
        submission_id: submissionId,
        doc_type: docType,
        filename: file.name,
        storage_path: storagePath,
        extracted_text: text || null,
        processed_at: new Date().toISOString(),
      }).select('id, filename, doc_type').single()

      if (doc) addedDocs.push(doc)
    }

    return NextResponse.json({ added: addedDocs }, { status: 201 })
  } catch (err) {
    console.error('Document upload error:', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
