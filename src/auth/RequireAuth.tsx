import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth, useUser } from '@clerk/react'
import { useStore } from '@/store/store'
import { EPIC_COLORS } from '@/lib/utils'
import { Spinner } from '@/components/ui/primitives'

/**
 * Maps the signed-in Clerk account onto a workspace member (matched by email, created
 * on first sign-in), keeps name/photo in sync, and makes them the current user.
 */
function useSyncClerkUser() {
  const { user, isLoaded } = useUser()
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!isLoaded || !user) return
    const s = useStore.getState()
    const email = (user.primaryEmailAddress?.emailAddress ?? `${user.id}@users.clerk`).toLowerCase()
    const name = user.fullName || user.username || email.split('@')[0]!
    let member = s.users.find((u) => u.clerkId === user.id) ?? s.users.find((u) => u.email.toLowerCase() === email)
    if (!member) {
      member = s.createUser({ name, email, title: 'Team member', color: EPIC_COLORS[s.users.length % EPIC_COLORS.length]!, clerkId: user.id, avatarUrl: user.imageUrl })
      // New people can work in every project straight away.
      for (const p of s.projects) if (!p.memberIds.includes(member.id)) s.updateProject(p.id, { memberIds: [...p.memberIds, member.id] })
    } else {
      s.updateUser(member.id, { clerkId: user.id, avatarUrl: user.hasImage ? user.imageUrl : member.avatarUrl, name: user.fullName || member.name, email })
    }
    if (s.currentUserId !== member.id) s.setCurrentUser(member.id)
    setReady(true)
  }, [isLoaded, user, user?.fullName, user?.imageUrl])
  return ready
}

/** Gate for every app route: loading → sign-in redirect → synced member. */
export function RequireAuth() {
  const { isLoaded, isSignedIn } = useAuth()
  const location = useLocation()
  const synced = useSyncClerkUser()
  if (!isLoaded || (isSignedIn && !synced))
    return (
      <div className="grid h-full place-items-center">
        <Spinner className="size-6" />
      </div>
    )
  if (!isSignedIn) {
    const back = location.pathname + location.search
    return <Navigate to={`/sign-in${back && back !== '/' ? `?redirect_url=${encodeURIComponent(window.location.origin + back)}` : ''}`} replace />
  }
  return <Outlet />
}
