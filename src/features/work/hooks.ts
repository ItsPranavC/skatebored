import { useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Project, WorkModule } from '@/types'
import { usePersistentState } from '@/features/board/filters'
import { isWorkView, type WorkView } from '@/lib/work'

export const moduleUrl = (project: Pick<Project, 'key'>, m: Pick<WorkModule, 'id'>, from?: string) => `/projects/${project.key}/modules/${m.id}${from ? `?from=${from}` : ''}`

/**
 * The Operations / Technical view for a project, kept in `?work=` so links (and the
 * sidebar) can open a view directly, and remembered per project.
 */
export function useWorkView(projectId: string) {
  const [params, setParams] = useSearchParams()
  const [saved, setSaved] = usePersistentState<WorkView>(`sb.work.view.${projectId}`, 'all')
  const fromUrl = params.get('work')
  const view: WorkView = isWorkView(fromUrl) ? fromUrl : saved
  useEffect(() => {
    if (isWorkView(fromUrl)) {
      if (fromUrl !== saved) setSaved(fromUrl)
    } else if (saved !== 'all') {
      // Reflect a remembered view in the URL, so the sidebar shows which view is open.
      setParams((p) => new URLSearchParams([...p.entries(), ['work', saved]]), { replace: true })
    }
  }, [fromUrl, saved, setSaved, setParams])
  const setView = useCallback(
    (v: WorkView) => {
      setSaved(v)
      setParams(
        (p) => {
          const next = new URLSearchParams(p)
          if (v === 'all') next.delete('work')
          else next.set('work', v)
          return next
        },
        { replace: true },
      )
    },
    [setParams, setSaved],
  )
  return [view, setView] as const
}
