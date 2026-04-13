import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { decryptField } from '@/lib/security'

/**
 * POST /api/procore/export
 * Export documents from a submission to a Procore project as attachments.
 * Body: { submission_id: number, project_id: string, contract_id?: string }
 */
export async function POST(req: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { submission_id, project_id, contract_id } = await req.json() as {
      submission_id: number
      project_id: string
      contract_id?: string
    }

    if (!submission_id || !project_id) {
      return NextResponse.json({ error: 'submission_id and project_id are required' }, { status: 400 })
    }

    const supabase = await getDb()

    // Get Procore settings
    const { data: settingsRows } = await supabase
      .from('settings')
      .select('key, value')
      .like('key', 'procore_%')

    const settings: Record<string, string> = {}
    ;(settingsRows ?? []).forEach((r: { key: string; value: string }) => { settings[r.key] = r.value })

    let accessToken = settings['procore_access_token'] ?? ''
    if (accessToken) {
      try { accessToken = decryptField(accessToken) } catch { /* use raw */ }
    }
    const companyId = settings['procore_company_id'] ?? ''

    if (!accessToken || !companyId) {
      return NextResponse.json({ error: 'Procore not configured' }, { status: 400 })
    }

    // Get all documents for the submission
    const { data: documents } = await supabase
      .from('documents')
      .select('id, doc_type, filename, storage_path')
      .eq('submission_id', submission_id)

    if (!documents || documents.length === 0) {
      return NextResponse.json({ error: 'No documents found for this submission' }, { status: 404 })
    }

    // Get submission info for naming
    const { data: submission } = await supabase
      .from('submissions')
      .select('*, subcontractors ( name, trade )')
      .eq('id', submission_id)
      .single()

    const subName = (submission?.subcontractors as Record<string, unknown>)?.name ?? 'Unknown'

    const exportResults: Array<{ filename: string; success: boolean; error?: string }> = []

    for (const doc of documents) {
      const storagePath = doc.storage_path as string
      if (!storagePath) {
        exportResults.push({ filename: doc.filename, success: false, error: 'No storage path' })
        continue
      }

      // Download from Supabase Storage
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('documents')
        .download(storagePath)

      if (downloadError || !fileData) {
        exportResults.push({ filename: doc.filename, success: false, error: 'File download failed' })
        continue
      }

      // Upload to Procore as an attachment
      const formData = new FormData()
      const blob = new Blob([await fileData.arrayBuffer()], { type: 'application/pdf' })
      const filename = `${subName}_${doc.doc_type}_${doc.filename}`

      // If contract_id is provided, attach to the commitment (subcontract)
      if (contract_id) {
        formData.append('file', blob, filename)
        formData.append('attachment[name]', filename)

        try {
          const uploadRes = await fetch(
            `https://api.procore.com/rest/v1.0/commitments/${contract_id}/attachments`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Procore-Company-Id': companyId,
              },
              body: formData,
            }
          )

          if (!uploadRes.ok) {
            const errBody = await uploadRes.text()
            exportResults.push({ filename, success: false, error: `Procore ${uploadRes.status}: ${errBody}` })
          } else {
            exportResults.push({ filename, success: true })
          }
        } catch (err) {
          exportResults.push({ filename, success: false, error: `Network error: ${err instanceof Error ? err.message : String(err)}` })
        }
      } else {
        // Attach to the project's documents/files section
        formData.append('file[data]', blob, filename)
        formData.append('file[name]', filename)
        formData.append('file[description]', `Insurance document for ${subName} - ${doc.doc_type}`)

        try {
          // First get or create the "Insurance" folder
          const foldersRes = await fetch(
            `https://api.procore.com/rest/v1.0/folders?project_id=${encodeURIComponent(project_id)}`,
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Procore-Company-Id': companyId,
              },
            }
          )

          let folderId: string | null = null
          if (foldersRes.ok) {
            const folders = await foldersRes.json() as Array<{ id: number; name: string }>
            const insuranceFolder = folders.find(f => f.name === 'Insurance')
            folderId = insuranceFolder ? String(insuranceFolder.id) : null

            // Create Insurance folder if it doesn't exist
            if (!folderId) {
              const createFolderRes = await fetch(
                `https://api.procore.com/rest/v1.0/folders?project_id=${encodeURIComponent(project_id)}`,
                {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Procore-Company-Id': companyId,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ folder: { name: 'Insurance', is_tracked: true } }),
                }
              )
              if (createFolderRes.ok) {
                const newFolder = await createFolderRes.json() as { id: number }
                folderId = String(newFolder.id)
              }
            }
          }

          // Upload file to project documents
          const uploadFormData = new FormData()
          uploadFormData.append('file[data]', blob, filename)
          uploadFormData.append('file[name]', filename)
          uploadFormData.append('file[description]', `Insurance document for ${subName} - ${doc.doc_type}`)
          if (folderId) {
            uploadFormData.append('file[folder_id]', folderId)
          }

          const uploadRes = await fetch(
            `https://api.procore.com/rest/v1.0/files?project_id=${encodeURIComponent(project_id)}`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Procore-Company-Id': companyId,
              },
              body: uploadFormData,
            }
          )

          if (!uploadRes.ok) {
            const errBody = await uploadRes.text()
            exportResults.push({ filename, success: false, error: `Procore ${uploadRes.status}: ${errBody}` })
          } else {
            exportResults.push({ filename, success: true })
          }
        } catch (err) {
          exportResults.push({ filename, success: false, error: `Network error: ${err instanceof Error ? err.message : String(err)}` })
        }
      }
    }

    const allSuccess = exportResults.every(r => r.success)
    return NextResponse.json({
      success: allSuccess,
      results: exportResults,
      exported: exportResults.filter(r => r.success).length,
      failed: exportResults.filter(r => !r.success).length,
    }, { status: allSuccess ? 200 : 207 })
  } catch (err) {
    console.error('Procore export error:', err)
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}
