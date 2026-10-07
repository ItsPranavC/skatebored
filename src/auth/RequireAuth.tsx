import { useCallback, useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth, useUser } from '@clerk/react'
import { useStore } from '@/store/store'
import { EPIC_COLORS } from '@/lib/utils'
import { Spinner, Button } from '@/components/ui/primitives'
import { startSync } from '@/sync/engine'

type Phase = 'idle' | 'loading' | 'ready' | 'error'

/** Connects the workspace store to the cloud once per session (after sign-in). */
function useCloudWorkspace(enabled: boolean) {
  const { getToken } = useAuth()
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const connect = useCallback(() => {
    setPhase('loading')
    setError(null)
    startSync(() => getToken())
      .then(() => setPhase('ready'))
      .catch((e: Error) => {
        // A browser that has synced before can keep working offline from its cache.
        if (useStore.getState().syncCursor != null) setPhase('ready')
        else {
          setError(e.message)
          setPhase('error')
        }
      })
  }, [getToken])
  useEffect(() => {
    if (enabled && phase === 'idle') connect()
  }, [enabled, phase, connect])
  return { phase, error, retry: connect }
}

/**
 * Maps the signed-in Clerk account onto a workspace member (matched by email, created
 * on first sign-in), keeps name/photo in sync, and makes them the current user.
 * Runs only after the cloud workspace is loaded, so the record is never overwritten.
 */
function useSyncClerkUser(enabled: boolean) {
  const { user, isLoaded } = useUser()
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!enabled || !isLoaded || !user) return
    const s = useStore.getState()
    const email = (user.primaryEmailAddress?.emailAddress ?? `${user.id}@users.clerk`).toLowerCase()
    const name = user.fullName || user.username || email.split('@')[0]!
    let member = s.users.find((u) => u.clerkId === user.id) ?? s.users.find((u) => u.email.toLowerCase() === email)
    if (!member) {
      member = s.createUser({ name, email, title: 'Team member', color: EPIC_COLORS[s.users.length % EPIC_COLORS.length]!, clerkId: user.id, avatarUrl: user.imageUrl })
      // New people can work in every project straight away.
      for (const p of s.projects) if (!p.memberIds.includes(member.id)) s.updateProject(p.id, { memberIds: [...p.memberIds, member.id] })
    } else {
      const patch = { clerkId: user.id, avatarUrl: user.hasImage ? user.imageUrl : member.avatarUrl, name: user.fullName || member.name, email }
      if (Object.entries(patch).some(([k, v]) => member![k as keyof typeof member] !== v)) s.updateUser(member.id, patch)
    }
    if (s.currentUserId !== member.id) s.setCurrentUser(member.id)
    setReady(true)
  }, [enabled, isLoaded, user, user?.fullName, user?.imageUrl])
  return ready
}

const Center = ({ children }: { children: React.ReactNode }) => <div className="grid h-full place-items-center p-8 text-center">{children}</div>

/** Gate for every app route: Clerk session → cloud workspace → member record. */
export function RequireAuth() {
  const { isLoaded, isSignedIn } = useAuth()
  const location = useLocation()
  const cloud = useCloudWorkspace(!!isSignedIn)
  const member = useSyncClerkUser(cloud.phase === 'ready')

  if (!isLoaded) return <Center><Spinner className="size-6" /></Center>
  if (!isSignedIn) {
    const back = location.pathname + location.search
    return <Navigate to={`/sign-in${back && back !== '/' ? `?redirect_url=${encodeURIComponent(window.location.origin + back)}` : ''}`} replace />
  }
  if (cloud.phase === 'error')
    return (
      <Center>
        <div className="max-w-md">
          <h1 className="display text-3xl">Can’t reach the workspace.</h1>
          <p className="mt-3 text-sm text-muted">{cloud.error}</p>
          <p className="mt-1 text-xs text-subtle">Nothing has been changed. Check your connection and try again.</p>
          <Button variant="primary" className="mt-6" onClick={cloud.retry}>
            Try again
          </Button>
        </div>
      </Center>
    )
  if (cloud.phase !== 'ready' || !member)
    return (
      <Center>
        <div className="flex flex-col items-center gap-3">
          <Spinner className="size-6" />
          <p className="text-[13px] text-muted">Loading your workspace…</p>
        </div>
      </Center>
    )
  return <Outlet />
}
