import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { classifyDocument } from '@/lib/ai'

export async function POST(request: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json() as { text: string }

    if (!body.text || body.text.trim().length < 20) {
      return NextResponse.json(
        { error: 'Insufficient text for classification. PDF may be image-based.' },
        { status: 400 }
      )
    }

    const result = await classifyDocument(body.text)
    return NextResponse.json(result)
  } catch (err) {
    console.error('Classification error:', err)
    return NextResponse.json({ error: 'Classification failed' }, { status: 500 })
  }
}
