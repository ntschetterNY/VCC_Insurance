/**
 * Authentication helpers built on Supabase Auth.
 * Supports email/password login with TOTP-based 2FA.
 */

import { createSupabaseServerClient, createSupabaseAdmin } from './supabase'

export const SESSION_COOKIE = 'sb-access-token' // Supabase manages its own cookies

export interface SessionUser {
  id: string
  email: string
  name: string
  role: string
}

// ---------------------------------------------------------------------------
// Get the currently authenticated user from Supabase session cookies
// ---------------------------------------------------------------------------
export async function getCurrentUser(): Promise<SessionUser | null> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return null

    // Fetch profile from our users table
    const { data: profile } = await supabase
      .from('users')
      .select('name, role')
      .eq('id', user.id)
      .single()

    return {
      id: user.id,
      email: user.email ?? '',
      name: profile?.name ?? user.email?.split('@')[0] ?? '',
      role: profile?.role ?? 'reviewer',
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Require authenticated user from request (for API routes)
// ---------------------------------------------------------------------------
export async function requireAuth(): Promise<SessionUser | null> {
  return getCurrentUser()
}

// ---------------------------------------------------------------------------
// Require admin role
// ---------------------------------------------------------------------------
export async function requireAdmin(): Promise<SessionUser | null> {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') return null
  return user
}

// ---------------------------------------------------------------------------
// Sign up a new user (admin-only action)
// Uses service-role client to bypass RLS
// ---------------------------------------------------------------------------
export async function createUser(
  email: string,
  password: string,
  name: string,
  role: 'admin' | 'reviewer'
): Promise<{ id: string } | { error: string }> {
  const admin = createSupabaseAdmin()

  // Create auth user
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // auto-confirm since admin is creating
  })
  if (error) return { error: error.message }

  // Insert profile row
  const { error: profileError } = await admin
    .from('users')
    .insert({ id: data.user.id, email, name, role })

  if (profileError) {
    // Rollback: delete auth user if profile insert fails
    await admin.auth.admin.deleteUser(data.user.id)
    return { error: profileError.message }
  }

  return { id: data.user.id }
}

// ---------------------------------------------------------------------------
// Delete a user (admin-only action)
// ---------------------------------------------------------------------------
export async function deleteUser(userId: string): Promise<void> {
  const admin = createSupabaseAdmin()
  await admin.from('users').delete().eq('id', userId)
  await admin.from('audit_log').delete().eq('user_id', userId)
  await admin.auth.admin.deleteUser(userId)
}

// ---------------------------------------------------------------------------
// Check if user has MFA enrolled
// ---------------------------------------------------------------------------
export async function getUserMfaStatus(userId: string): Promise<{
  enrolled: boolean
  verified: boolean
}> {
  const admin = createSupabaseAdmin()
  const { data } = await admin.auth.admin.mfa.listFactors({ userId })
  const totpFactors = data?.factors?.filter(f => f.factor_type === 'totp') ?? []
  const verified = totpFactors.some(f => f.status === 'verified')
  return { enrolled: totpFactors.length > 0, verified }
}
