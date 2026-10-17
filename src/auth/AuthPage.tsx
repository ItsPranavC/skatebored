import { SignIn, SignUp, useAuth } from '@clerk/react'
import { Navigate } from 'react-router-dom'
import { Logo } from '@/components/jira'
import { Spinner } from '@/components/ui/primitives'

/** Brand-forward auth screen: skatebored hero type on the left, Clerk's form on the right. */
export default function AuthPage({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const { isLoaded, isSignedIn } = useAuth()
  if (isLoaded && isSignedIn) return <Navigate to="/projects" replace />
  return (
    <main className="grid min-h-full bg-canvas lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden border-r border-line p-12 lg:flex">
        <Logo />
        <div>
          <h1 className="display max-w-[14ch] text-[clamp(3rem,5.4vw,5.5rem)]">
            plan the sprint. <span className="text-accent">ship the trick.</span>
          </h1>
          <p className="mt-6 max-w-md text-[16px] leading-relaxed text-muted">
            The skatebored team’s scrum workspace — boards, backlog, reports, and one-click hand-off of any ticket to your coding agent.
          </p>
        </div>
        <p className="text-[12px] text-subtle">skatebored — an adaptive learning platform.</p>
        {/* deck silhouette, echoing the hero board on skatebored.org */}
        <svg aria-hidden viewBox="0 0 400 140" className="pointer-events-none absolute -right-24 bottom-24 w-[520px] -rotate-12 opacity-[0.13]">
          <rect x="10" y="30" width="380" height="70" rx="35" fill="var(--accent)" />
          <circle cx="90" cy="118" r="16" fill="var(--fg)" />
          <circle cx="310" cy="118" r="16" fill="var(--fg)" />
        </svg>
      </section>
      <section className="flex flex-col items-center justify-center gap-8 p-6">
        <div className="lg:hidden">
          <Logo />
        </div>
        {!isLoaded && <Spinner className="size-6" />}
        {mode === 'sign-in' ? (
          <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" />
        ) : (
          <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" />
        )}
      </section>
    </main>
  )
}
