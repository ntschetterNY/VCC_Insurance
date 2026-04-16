import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createSupabaseAdmin } from '@/lib/supabase'
import { sanitizeString } from '@/lib/security'
import crypto from 'crypto'

/**
 * PATCH /api/admin/registrations/[id]
 * Body: { action: 'approve' | 'reject', role?: 'admin' | 'reviewer', notes?: string }
 *
 * approve: creates an auth user with a random temporary password, marks
 * must_change_password=true so they must set their password on first login,
 * and returns the temporary password for the admin to share.
 *
 * reject: sets status=rejected with optional notes.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json() as {
    action: 'approve' | 'reject'
    role?: 'admin' | 'reviewer'
    notes?: string
  }

  if (body.action !== 'approve' && body.action !== 'reject') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const db = createSupabaseAdmin()
  const reqId = parseInt(params.id)

  const { data: request, error: reqErr } = await db
    .from('registration_requests')
    .select('*')
    .eq('id', reqId)
    .single()
  if (reqErr || !request) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  if (request.status !== 'pending') {
    return NextResponse.json({ error: `Request already ${request.status}` }, { status: 400 })
  }

  if (body.action === 'reject') {
    await db
      .from('registration_requests')
      .update({
        status: 'rejected',
        reviewed_by: admin.id,
        reviewed_at: new Date().toISOString(),
        review_notes: body.notes ? sanitizeString(body.notes) : null,
      })
      .eq('id', reqId)
    return NextResponse.json({ ok: true, status: 'rejected' })
  }

  // approve → create user with random temp password + must_change_password
  const role = body.role === 'admin' ? 'admin' : 'reviewer'
  const tempPassword = generateTempPassword()

  const { data: authUser, error: authErr } = await db.auth.admin.createUser({
    email: request.email,
    password: tempPassword,
    email_confirm: true,
  })
  if (authErr || !authUser?.user) {
    return NextResponse.json({ error: authErr?.message ?? 'Failed to create auth user' }, { status: 500 })
  }

  const { error: profileErr } = await db.from('users').insert({
    id: authUser.user.id,
    email: request.email,
    name: request.name,
    role,
    status: 'active',
    must_change_password: true,
    created_by: admin.id,
  })
  if (profileErr) {
    await db.auth.admin.deleteUser(authUser.user.id)
    return NextResponse.json({ error: profileErr.message }, { status: 500 })
  }

  await db
    .from('registration_requests')
    .update({
      status: 'approved',
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
      review_notes: body.notes ? sanitizeString(body.notes) : null,
    })
    .eq('id', reqId)

  return NextResponse.json({
    ok: true,
    status: 'approved',
    user_id: authUser.user.id,
    email: request.email,
    temp_password: tempPassword,
    note: 'Share this temporary password with the user. They will be required to change it on first login.',
  })
}

function generateTempPassword() {
  // 12-char password, mixed case + digits + symbol
  const bytes = crypto.randomBytes(9).toString('base64url')
  return `Tmp-${bytes}`
}
