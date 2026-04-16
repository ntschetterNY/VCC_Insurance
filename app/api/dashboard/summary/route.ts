import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createSupabaseAdmin } from '@/lib/supabase'
import { syncPlaceholderProjectNames } from '@/lib/procoreProjects'

interface SubmissionRow {
  id: number
  status: string | null
  uploaded_at: string | null
  project_id: number | null
  procore_project_id: string | null
  gl_expiration: string | null
  wc_expiration: string | null
  auto_expiration: string | null
  umbrella_expiration: string | null
  sub_id: number
  subcontractors: { name: string; trade: string | null; tier: string | null } | null
}

interface ProjectRow {
  id: number
  name: string
  procore_project_id: string | null
  address: string | null
}

function daysBetween(from: Date, to: Date) {
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24))
}

export async function GET() {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createSupabaseAdmin()

  // Opportunistically replace migration-placeholder project names
  // ("Procore Project {id}") with the real Procore friendly name. No-ops
  // once every row has a real name or if Procore is not reachable.
  try {
    await syncPlaceholderProjectNames()
  } catch {
    /* non-fatal */
  }

  const { data: projects } = await admin
    .from('projects')
    .select('id, name, procore_project_id, address')
    .eq('active', true)
    .order('name')

  const { data: submissions } = await admin
    .from('submissions')
    .select(`
      id, status, uploaded_at, project_id, procore_project_id,
      gl_expiration, wc_expiration, auto_expiration, umbrella_expiration,
      sub_id,
      subcontractors ( name, trade, tier )
    `)
    .order('uploaded_at', { ascending: false })

  const subs = (submissions as unknown as SubmissionRow[]) ?? []
  const projs = (projects as unknown as ProjectRow[]) ?? []

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Upcoming expirations (within 60 days, or already expired)
  const upcoming: Array<{
    submission_id: number
    sub_name: string
    trade: string
    tier: string
    project_id: number | null
    project_name: string | null
    policy_type: 'gl' | 'wc' | 'auto' | 'umbrella'
    expires_on: string
    days_until: number
    status: 'expired' | 'critical' | 'warning' | 'ok'
  }> = []

  const policyCols: Array<['gl' | 'wc' | 'auto' | 'umbrella', keyof SubmissionRow]> = [
    ['gl', 'gl_expiration'],
    ['wc', 'wc_expiration'],
    ['auto', 'auto_expiration'],
    ['umbrella', 'umbrella_expiration'],
  ]

  for (const s of subs) {
    for (const [type, col] of policyCols) {
      const raw = s[col] as string | null
      if (!raw) continue
      const d = new Date(raw)
      if (Number.isNaN(d.getTime())) continue
      const days = daysBetween(today, d)
      if (days > 60) continue

      let status: 'expired' | 'critical' | 'warning' | 'ok'
      if (days < 0) status = 'expired'
      else if (days <= 7) status = 'critical'
      else if (days <= 30) status = 'warning'
      else status = 'ok'

      const proj = projs.find((p) => p.id === s.project_id) ?? null
      upcoming.push({
        submission_id: s.id,
        sub_name: s.subcontractors?.name ?? 'Unknown',
        trade: s.subcontractors?.trade ?? '',
        tier: s.subcontractors?.tier ?? '',
        project_id: s.project_id,
        project_name: proj?.name ?? null,
        policy_type: type,
        expires_on: raw,
        days_until: days,
        status,
      })
    }
  }
  upcoming.sort((a, b) => a.days_until - b.days_until)

  // Per-project compliance rollup
  const projectRollup = projs.map((p) => {
    const projSubs = subs.filter((s) => s.project_id === p.id)
    const total = projSubs.length
    const approved = projSubs.filter((s) => s.status === 'approved').length
    const pending = projSubs.filter((s) => s.status === 'pending' || s.status === 'reviewing').length
    const rejected = projSubs.filter((s) => s.status === 'rejected').length
    const expiring = upcoming.filter((u) => u.project_id === p.id && u.status !== 'ok').length
    const expired = upcoming.filter((u) => u.project_id === p.id && u.status === 'expired').length
    const primary = projSubs.filter((s) => s.subcontractors?.tier === 'primary').length
    const secondTier = projSubs.filter((s) => s.subcontractors?.tier === 'second').length

    let health: 'good' | 'warning' | 'critical'
    if (expired > 0 || rejected > 0) health = 'critical'
    else if (expiring > 0 || pending > 0) health = 'warning'
    else health = 'good'

    return {
      id: p.id,
      name: p.name,
      procore_project_id: p.procore_project_id,
      address: p.address,
      total,
      approved,
      pending,
      rejected,
      expiring,
      expired,
      primary,
      second_tier: secondTier,
      health,
    }
  })

  // Submissions with no project yet (orphans)
  const orphans = subs.filter((s) => !s.project_id).length

  // Totals
  const total = subs.length
  const approved = subs.filter((s) => s.status === 'approved').length
  const pending = subs.filter((s) => s.status === 'pending' || s.status === 'reviewing').length
  const rejected = subs.filter((s) => s.status === 'rejected').length
  const complianceRate = total > 0 ? Math.round((approved / total) * 100) : 0

  // Open flags (pending check) count
  const { count: openFlagsCount } = await admin
    .from('reviewer_flags')
    .select('*', { count: 'exact', head: true })
    .eq('check_status', 'pending')

  return NextResponse.json({
    totals: {
      total,
      approved,
      pending,
      rejected,
      compliance_rate: complianceRate,
      orphan_submissions: orphans,
      open_flags: openFlagsCount ?? 0,
      active_projects: projs.length,
    },
    projects: projectRollup,
    upcoming_expirations: upcoming,
  })
}
