import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { classifyDocument } from '@/lib/ai'
import { generateFileHash } from '@/lib/security'
import pdfParse from 'pdf-parse'

// Allow up to 60s for PDF extraction + AI classification
export const maxDuration = 60

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

    // Fetch classification hints from memory to improve AI accuracy
    const { data: classificationMemory } = await supabase
      .from('memory')
      .select('description')
      .eq('category', 'Classification Rule')
      .eq('active', true)
    const classificationHints = (classificationMemory ?? [])
      .map((m: { description: string }) => m.description)
      .filter(Boolean)

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
          const classification = await classifyDocument(text, submissionId, classificationHints)
          docType = classification.doc_type
        } catch (err) {
          console.error(`[Documents] Classification failed for "${file.name}":`, err)
        }
      }

      // Upload to Supabase Storage
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const fileHash = generateFileHash(buffer)
      const storagePath = `${submissionId}/${fileHash}_${docType}_${safeName}`

      // If this exact file is already recorded for this submission, treat as a
      // no-op so retries after a partial failure (or accidental re-uploads of
      // the same PDF) don't hard-fail the whole batch.
      const { data: existingDoc } = await supabase
        .from('documents')
        .select('id, filename, doc_type')
        .eq('submission_id', submissionId)
        .eq('storage_path', storagePath)
        .maybeSingle()
      if (existingDoc) {
        addedDocs.push(existingDoc)
        continue
      }

      // `upsert: true` handles the case where a storage object was written on
      // a prior attempt but the documents row never got inserted — identical
      // content at the same path is safe to overwrite.
      const { error: storageError } = await supabase.storage.from('documents').upload(storagePath, buffer, {
        contentType: 'application/pdf',
        upsert: true,
      })
      if (storageError) {
        console.error(`[Documents] Storage upload failed for "${file.name}":`, storageError)
        throw new Error(`Failed to store file "${file.name}": ${storageError.message}`)
      }

      // Insert document record
      const { data: doc, error: docInsertError } = await supabase.from('documents').insert({
        submission_id: submissionId,
        doc_type: docType,
        filename: file.name,
        storage_path: storagePath,
        extracted_text: text || null,
        processed_at: new Date().toISOString(),
      }).select('id, filename, doc_type').single()
      if (docInsertError) {
        console.error(`[Documents] Document insert failed for "${file.name}":`, docInsertError)
        throw new Error(`Failed to save document record for "${file.name}": ${docInsertError.message}`)
      }

      if (doc) addedDocs.push(doc)
    }

    return NextResponse.json({ added: addedDocs }, { status: 201 })
  } catch (err) {
    console.error('Document upload error:', err)
    const message = err instanceof Error ? err.message : 'Upload failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
