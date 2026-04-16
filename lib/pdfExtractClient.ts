/**
 * Client-side PDF text extraction using pdfjs-dist.
 *
 * This runs in the browser so we can convert an oversized PDF into a
 * much smaller Markdown blob before uploading — avoiding Vercel's 4.5 MB
 * serverless body limit for large policy documents.
 *
 * The pdfjs-dist worker is served out of /public (copied there by the
 * postinstall script in package.json), so the browser fetches it from
 * the same origin rather than a CDN.
 */

// Type-only imports keep the heavy library out of the server bundle.
import type { PDFDocumentProxy, TextItem, TextMarkedContent } from 'pdfjs-dist/types/src/display/api'

let workerConfigured = false

async function loadPdfJs() {
  // Dynamic import so pdfjs-dist is only fetched when a user actually
  // needs client-side extraction (i.e. drops a large PDF).
  const pdfjs = await import('pdfjs-dist')
  if (!workerConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
    workerConfigured = true
  }
  return pdfjs
}

/**
 * Extract text from a PDF File in the browser.
 * Returns a single string with page breaks between pages.
 */
export async function extractPdfTextClient(file: File): Promise<string> {
  const pdfjs = await loadPdfJs()
  const buffer = await file.arrayBuffer()
  const doc: PDFDocumentProxy = await pdfjs.getDocument({ data: buffer }).promise
  try {
    const pages: string[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      const text = content.items
        .map((item: TextItem | TextMarkedContent) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (text) pages.push(text)
    }
    return pages.join('\n\n--- Page Break ---\n\n')
  } finally {
    await doc.destroy()
  }
}

/**
 * Convert a large PDF File into a Markdown File containing the locally-
 * extracted text. The returned File is a drop-in replacement suitable for
 * upload via the existing multipart endpoints.
 */
export async function convertPdfToMarkdown(pdfFile: File): Promise<File> {
  const text = await extractPdfTextClient(pdfFile)
  const header =
    `<!-- Extracted locally from "${pdfFile.name}" ` +
    `(${(pdfFile.size / 1024 / 1024).toFixed(1)} MB original PDF) ` +
    `because the original exceeded the server upload limit. -->\n\n`
  const mdName = pdfFile.name.replace(/\.pdf$/i, '') + '.md'
  return new File([header + text], mdName, { type: 'text/markdown' })
}
