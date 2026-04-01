import pdfParse from 'pdf-parse'
import fs from 'fs'

export async function extractPdfText(filepath: string): Promise<string> {
  const buffer = fs.readFileSync(filepath)
  const data = await pdfParse(buffer)
  return data.text
}
