import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * GET /api/auth/debug
 * Diagnostic endpoint to verify Supabase connection and configuration.
 * Remove this endpoint before going to production.
 */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  const checks: Record<string, unknown> = {
    supabase_url_set: !!url,
    supabase_url_preview: url ? url.substring(0, 30) + '...' : 'MISSING',
    anon_key_set: !!anonKey,
    anon_key_length: anonKey?.length ?? 0,
    service_key_set: !!serviceKey,
    service_key_length: serviceKey?.length ?? 0,
    encryption_key_set: !!process.env.ENCRYPTION_KEY,
  }

  // Test Supabase connection
  if (url && anonKey) {
    try {
      const supabase = createClient(url, anonKey)
      const { data, error } = await supabase.from('settings').select('key').limit(1)
      checks.db_connection = error ? `ERROR: ${error.message}` : 'OK'
      checks.db_result = data
    } catch (err) {
      checks.db_connection = `EXCEPTION: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  // Test auth service
  if (url && serviceKey) {
    try {
      const admin = createClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
      const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 5 })
      checks.auth_service = error ? `ERROR: ${error.message}` : 'OK'
      checks.auth_user_count = data?.users?.length ?? 0
      checks.auth_users = data?.users?.map(u => ({
        id: u.id,
        email: u.email,
        confirmed: !!u.email_confirmed_at,
        created: u.created_at,
      })) ?? []
    } catch (err) {
      checks.auth_service = `EXCEPTION: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  return NextResponse.json(checks, { status: 200 })
}
