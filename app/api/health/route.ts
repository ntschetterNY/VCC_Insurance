import { NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'

/**
 * GET /api/health
 * Health check endpoint. Also used by Vercel cron to prevent
 * Supabase free-tier project from pausing due to inactivity.
 */
export async function GET() {
  try {
    const supabase = createSupabaseAdmin()
    // Simple query to keep the database active
    const { error } = await supabase.from('settings').select('key').limit(1)
    return NextResponse.json({ status: 'ok', db: error ? 'error' : 'connected' })
  } catch {
    return NextResponse.json({ status: 'ok', db: 'unavailable' })
  }
}
