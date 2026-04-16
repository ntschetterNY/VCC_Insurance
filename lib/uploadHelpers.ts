/**
 * Shared client-side helpers for the document upload flow used by both
 * /upload (new submission) and /review/[id] (add docs to existing
 * submission).
 */

/**
 * Files larger than this are converted to Markdown in the browser before
 * upload so no single request exceeds Vercel's 4.5 MB serverless body
 * limit. See lib/pdfExtractClient.ts for the conversion itself.
 */
export const LARGE_PDF_THRESHOLD = 4 * 1024 * 1024 // 4 MB

export function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

export function isSupportedDoc(file: File): boolean {
  if (isPdf(file)) return true
  const n = file.name.toLowerCase()
  if (n.endsWith('.md') || n.endsWith('.markdown') || n.endsWith('.txt')) return true
  if (file.type === 'text/markdown' || file.type === 'text/plain') return true
  return false
}

export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

/**
 * Pull a useful error message out of a failed fetch response. Handles
 * three cases the server can't control:
 *   - JSON error body with { error: string }        → return body.error
 *   - empty body (Vercel edge rejections, 413/504)  → use fallback + status hint
 *   - HTML error page from a proxy/gateway          → use fallback + status
 *
 * In every case we include the HTTP status so the user sees a concrete
 * failure instead of the opaque "Upload failed" fallback.
 */
export async function extractErrorMessage(res: Response, fallback: string): Promise<string> {
  const statusSuffix = `${res.status}${res.statusText ? ' ' + res.statusText : ''}`.trim()
  const text = await res.text().catch(() => '')
  if (text) {
    try {
      const body = JSON.parse(text)
      if (body?.error) return body.error
    } catch {
      // not JSON — likely an HTML error page from the edge
    }
  }
  if (res.status === 413) {
    return `${fallback}: file is too large for the server (${statusSuffix}). Remove or split files over ~4 MB.`
  }
  if (res.status === 504) {
    return `${fallback}: the server timed out processing the file (${statusSuffix}). Try again or upload fewer files at once.`
  }
  return `${fallback} (${statusSuffix})`
}
