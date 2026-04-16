import { createSupabaseAdmin } from '@/lib/supabase'
import { getValidAccessToken } from '@/app/api/procore/route'

/**
 * Fetches the current Procore project list and returns a map of
 * procore_project_id (as string) -> friendly display name.
 * Returns null if Procore is not configured or the request fails.
 */
export async function fetchProcoreProjectNameMap(): Promise<Map<string, string> | null> {
  const tokenResult = await getValidAccessToken()
  if ('error' in tokenResult) return null

  const { token, companyId } = tokenResult

  try {
    // Procore paginates with 100 per page by default; page through all.
    const map = new Map<string, string>()
    let page = 1
    for (;;) {
      const res = await fetch(
        `https://api.procore.com/rest/v1.0/projects?company_id=${encodeURIComponent(companyId)}&per_page=100&page=${page}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Procore-Company-Id': companyId,
          },
        }
      )
      if (!res.ok) return map.size > 0 ? map : null

      const projects = (await res.json()) as Array<{
        id: number
        name: string
        display_name?: string
      }>
      if (!Array.isArray(projects) || projects.length === 0) break

      for (const p of projects) {
        map.set(String(p.id), p.display_name ?? p.name)
      }
      if (projects.length < 100) break
      page += 1
      if (page > 50) break // safety: 5000 projects cap
    }
    return map
  } catch {
    return null
  }
}

/**
 * For any public.projects row whose name is missing or still looks like the
 * migration placeholder ("Procore Project {id}"), replace it with the
 * friendly display name from Procore. Safe to call repeatedly: only rows
 * that still look like placeholders are touched.
 *
 * Returns the number of projects updated, or -1 if Procore could not be
 * reached / is not configured.
 */
export async function syncPlaceholderProjectNames(): Promise<number> {
  const admin = createSupabaseAdmin()

  const { data: rows } = await admin
    .from('projects')
    .select('id, name, procore_project_id')
    .not('procore_project_id', 'is', null)

  if (!rows || rows.length === 0) return 0

  // Only look up names for rows that still have a placeholder
  const placeholders = rows.filter((r) =>
    !r.name || /^Procore Project /.test(r.name)
  )
  if (placeholders.length === 0) return 0

  const nameMap = await fetchProcoreProjectNameMap()
  if (!nameMap) return -1

  let updated = 0
  for (const r of placeholders) {
    const friendly = nameMap.get(String(r.procore_project_id))
    if (friendly && friendly !== r.name) {
      const { error } = await admin
        .from('projects')
        .update({ name: friendly })
        .eq('id', r.id)
      if (!error) updated += 1
    }
  }
  return updated
}
