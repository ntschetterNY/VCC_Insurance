import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { SECURITY_HEADERS } from '@/lib/security'

const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/callback']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Allow public paths and Next.js internals
  if (
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p)) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  ) {
    const res = NextResponse.next()
    applySecurityHeaders(res)
    return res
  }

  // Create Supabase client scoped to the request/response cookies
  let response = NextResponse.next({ request: { headers: req.headers } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          req.cookies.set({ name, value, ...options })
          response = NextResponse.next({ request: { headers: req.headers } })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          req.cookies.set({ name, value: '', ...options })
          response = NextResponse.next({ request: { headers: req.headers } })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  // Refresh the session (important for token rotation)
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    if (pathname.startsWith('/api/')) {
      const errorRes = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      applySecurityHeaders(errorRes)
      return errorRes
    }
    const loginUrl = req.nextUrl.clone()
    loginUrl.pathname = '/login'
    const redirectRes = NextResponse.redirect(loginUrl)
    applySecurityHeaders(redirectRes)
    return redirectRes
  }

  applySecurityHeaders(response)
  return response
}

function applySecurityHeaders(res: NextResponse) {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    res.headers.set(key, value)
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
