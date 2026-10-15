import { useMemo } from 'react'
import { useStore } from '@/store/store'
import { runJql, type JqlResult } from '@/lib/jql'

/** Runs a JQL query against the live store. */
export function useJql(jql: string): JqlResult {
  const issues = useStore((s) => s.issues)
  const projects = useStore((s) => s.projects)
  const sprints = useStore((s) => s.sprints)
  const users = useStore((s) => s.users)
  const modules = useStore((s) => s.modules)
  const currentUserId = useStore((s) => s.currentUserId)
  return useMemo(
    () => runJql(jql, { issues, projects, sprints, users, modules, currentUserId }),
    [jql, issues, projects, sprints, users, modules, currentUserId],
  )
}
