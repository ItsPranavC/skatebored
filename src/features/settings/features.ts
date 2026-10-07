import { useCallback, useEffect, useState } from 'react'

export interface ProjectFeatures {
  sprints: boolean
  timeline: boolean
  reports: boolean
  estimation: boolean
  releases: boolean
}

const DEFAULTS: ProjectFeatures = { sprints: true, timeline: true, reports: true, estimation: true, releases: true }
const key = (projectId: string) => `skatebored-features:${projectId}`
const EVT = 'skatebored-features-change'

export function readFeatures(projectId: string): ProjectFeatures {
  try {
    const raw = localStorage.getItem(key(projectId))
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

/** Per-project feature toggles, persisted per browser. */
export function useProjectFeatures(projectId: string) {
  const [features, setFeatures] = useState(() => readFeatures(projectId))
  useEffect(() => {
    setFeatures(readFeatures(projectId))
    const sync = () => setFeatures(readFeatures(projectId))
    window.addEventListener(EVT, sync)
    return () => window.removeEventListener(EVT, sync)
  }, [projectId])
  const set = useCallback(
    (id: keyof ProjectFeatures, v: boolean) => {
      const next = { ...readFeatures(projectId), [id]: v }
      try {
        localStorage.setItem(key(projectId), JSON.stringify(next))
      } catch {
        /* storage unavailable — keep in memory */
      }
      setFeatures(next)
      window.dispatchEvent(new Event(EVT))
    },
    [projectId],
  )
  return [features, set] as const
}
