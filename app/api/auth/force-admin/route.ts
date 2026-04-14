import { NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'

/**
 * GET /api/auth/force-admin
 * Diagnoses and fixes admin setup for n.tschetter@vorea.com.
 * Shows every step for debugging. REMOVE after setup is complete.
 */
export async function GET() {
  const TARGET_EMAIL = 'n.tschetter@vorea.com'
  const log: string[] = []

  try {
    const admin = createSupabaseAdmin()
    log.push('1. Admin client created')

    // Step 1: List ALL auth users
    const { data: authData, error: authError } = await admin.auth.admin.listUsers({ page: 1, perPage: 50 })

    if (authError) {
      return NextResponse.json({ error: authError.message, log }, { status: 500 })
    }

    const allEmails = authData?.users?.map(u => ({ id: u.id, email: u.email, confirmed: !!u.email_confirmed_at })) ?? []
    log.push(`2. Found ${allEmails.length} auth users: ${JSON.stringify(allEmails)}`)

    const authUser = authData?.users?.find(u => u.email === TARGET_EMAIL)

    if (!authUser) {
      return NextResponse.json({
        error: `${TARGET_EMAIL} not found in Supabase Auth`,
        auth_users: allEmails,
        log,
      }, { status: 404 })
    }

    log.push(`3. Found target user: id=${authUser.id}, email=${authUser.email}`)

    // Step 2: Check what's in the users table
    const { data: allProfiles, error: profilesError } = await admin
      .from('users')
      .select('*')

    log.push(`4. Users table: ${profilesError ? `ERROR: ${profilesError.message}` : `${allProfiles?.length ?? 0} rows`}`)
    if (allProfiles) {
      log.push(`   Profiles: ${JSON.stringify(allProfiles)}`)
    }

    // Step 3: Delete any existing row for this user (clean slate)
    const { error: deleteError } = await admin
      .from('users')
      .delete()
      .eq('id', authUser.id)

    log.push(`5. Deleted existing row: ${deleteError ? `ERROR: ${deleteError.message}` : 'OK'}`)

    // Step 4: Insert fresh admin row
    const { data: insertData, error: insertError } = await admin
      .from('users')
      .insert({
        id: authUser.id,
        email: TARGET_EMAIL,
        name: 'N. Tschetter',
        role: 'admin',
      })
      .select()
      .single()

    log.push(`6. Insert admin row: ${insertError ? `ERROR: ${insertError.message}` : 'OK'}`)
    if (insertData) {
      log.push(`   Inserted: ${JSON.stringify(insertData)}`)
    }

    // Step 5: Verify the row exists and is admin
    const { data: verify, error: verifyError } = await admin
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .single()

    log.push(`7. Verify: ${verifyError ? `ERROR: ${verifyError.message}` : JSON.stringify(verify)}`)

    return NextResponse.json({
      success: !insertError && !verifyError,
      verified_role: verify?.role ?? 'UNKNOWN',
      user_id: authUser.id,
      email: TARGET_EMAIL,
      log,
    })
  } catch (err) {
    log.push(`EXCEPTION: ${err instanceof Error ? err.message : String(err)}`)
    return NextResponse.json({ error: 'Failed', log }, { status: 500 })
  }
}
