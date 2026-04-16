import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'
import { sanitizeString, isValidEmail, rateLimit } from '@/lib/security'

// Public endpoint — records a registration request for admin review.
// We deliberately don't create an auth user here; admins approve the
// request first.
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'
  if (!rateLimit(`register:${ip}`, { maxRequests: 3, windowMs: 60_000 })) {
    return NextResponse.json(
      { error: 'Too many registration attempts. Please try again in a minute.' },
      { status: 429 }
    )
  }

  const body = await req.json() as {
    email?: string
    name?: string
    company?: string
    reason?: string
  }

  const email = sanitizeString(body.email ?? '').toLowerCase()
  const name = sanitizeString(body.name ?? '')
  const company = sanitizeString(body.company ?? '')
  const reason = sanitizeString(body.reason ?? '')

  if (!email || !name) {
    return NextResponse.json({ error: 'Email and name are required' }, { status: 400 })
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
  }

  const admin = createSupabaseAdmin()

  // Reject if the email is already a user
  const { data: existing } = await admin
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle()
  if (existing) {
    return NextResponse.json({ error: 'An account with this email already exists. Please sign in instead.' }, { status: 409 })
  }

  // Idempotent: upsert on email. If there's a pending request, refresh the
  // timestamp and return success.
  const { data: existingReq } = await admin
    .from('registration_requests')
    .select('id, status')
    .eq('email', email)
    .maybeSingle()

  if (existingReq && existingReq.status === 'pending') {
    return NextResponse.json({
      ok: true,
      message: 'A registration request for this email is already pending admin review.',
    })
  }

  if (existingReq && existingReq.status === 'rejected') {
    // Re-open a rejected request
    const { error } = await admin
      .from('registration_requests')
      .update({ status: 'pending', name, company, reason, reviewed_at: null, review_notes: null })
      .eq('id', existingReq.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, message: 'Registration submitted for admin approval.' })
  }

  const { error } = await admin
    .from('registration_requests')
    .insert({ email, name, company: company || null, reason: reason || null, status: 'pending' })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, message: 'Registration submitted for admin approval.' })
}
