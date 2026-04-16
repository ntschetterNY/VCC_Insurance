import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { fetchProcoreProjectNameMap } from '@/lib/procoreProjects'
import { createSupabaseAdmin } from '@/lib/supabase'

/**
 * Force-refresh every project's name from Procore. Admin only.
 * Unlike the opportunistic sync in /api/dashboard/summary (which only
 * overwrites migration placeholders), this updates every row that has a
 * procore_project_id whose current name differs from Procore.
 */
export async function POST() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const nameMap = await fetchProcoreProjectNameMap()
  if (!nameMap) {
    return NextResponse.json(
      { error: 'Unable to reach Procore or Procore is not configured.' },
      { status: 502 }
    )
  }

  const admin = createSupabaseAdmin()
  const { data: rows } = await admin
    .from('projects')
    .select('id, name, procore_project_id')
    .not('procore_project_id', 'is', null)

  let updated = 0
  let unchanged = 0
  const missing: string[] = []

  for (const r of rows ?? []) {
    const friendly = nameMap.get(String(r.procore_project_id))
    if (!friendly) {
      missing.push(r.procore_project_id as string)
      continue
    }
    if (friendly === r.name) {
      unchanged += 1
      continue
    }
    const { error } = await admin
      .from('projects')
      .update({ name: friendly })
      .eq('id', r.id)
    if (!error) updated += 1
  }

  return NextResponse.json({
    updated,
    unchanged,
    missing_in_procore: missing,
    total_procore_projects: nameMap.size,
  })
}
