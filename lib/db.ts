/**
 * Database access layer — Supabase PostgreSQL.
 *
 * Exports a helper that returns a typed Supabase client scoped to the
 * current user's session (respects RLS). For admin/service-level access
 * use createSupabaseAdmin() directly from lib/supabase.ts.
 */

import { createSupabaseServerClient, createSupabaseAdmin } from './supabase'

/**
 * Get a Supabase client that respects the current user's session and RLS.
 * Use this in API routes for all data operations.
 */
export async function getDb() {
  return createSupabaseServerClient()
}

/**
 * Get a service-role Supabase client (bypasses RLS).
 * Use only for admin operations, migrations, or seeding.
 */
export function getAdminDb() {
  return createSupabaseAdmin()
}

export default getDb
