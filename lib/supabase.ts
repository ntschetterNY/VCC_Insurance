import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// ---------------------------------------------------------------------------
// Environment helpers
// ---------------------------------------------------------------------------
function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL env var')
  return url
}

function getSupabaseAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY env var')
  return key
}

function getSupabaseServiceKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY env var')
  return key
}

// ---------------------------------------------------------------------------
// Server-side client (uses cookies from Next.js request context)
// Suitable for API routes and server components.
// ---------------------------------------------------------------------------
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  return createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options })
        } catch {
          // set() may fail in Server Components (read-only), safe to ignore
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: '', ...options })
        } catch {
          // same as above
        }
      },
    },
  })
}

// ---------------------------------------------------------------------------
// Service-role client (bypasses RLS — use only in trusted server contexts)
// ---------------------------------------------------------------------------
export function createSupabaseAdmin() {
  return createClient(getSupabaseUrl(), getSupabaseServiceKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// ---------------------------------------------------------------------------
// Client-side singleton (for browser components)
// ---------------------------------------------------------------------------
let browserClient: ReturnType<typeof createClient> | null = null
export function getSupabaseBrowserClient() {
  if (browserClient) return browserClient
  browserClient = createClient(getSupabaseUrl(), getSupabaseAnonKey())
  return browserClient
}
