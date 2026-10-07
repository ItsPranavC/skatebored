import { Logo } from '@/components/jira'

/** Shown instead of the app when VITE_CLERK_PUBLISHABLE_KEY isn't configured — auth is never silently skipped. */
export function MissingClerkKey() {
  return (
    <main className="grid min-h-full place-items-center bg-canvas p-8">
      <div className="w-full max-w-xl">
        <Logo />
        <h1 className="display mt-10 text-[clamp(2.2rem,5vw,3.5rem)]">
          Sign-in isn’t <span className="text-accent">set up yet.</span>
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-muted">
          This workspace uses Clerk for authentication, but no publishable key was found. Add one to <code className="rounded bg-surface-3 px-1.5 py-0.5 text-fg">.env.local</code> and restart the dev server.
        </p>
        <ol className="mt-6 space-y-3 text-[14px]">
          <li className="rounded-xl border border-line bg-surface p-4">
            <div className="font-semibold">1 · Link a Clerk app</div>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-canvas p-3 text-[12.5px] text-muted">npx clerk auth login{'\n'}npx clerk init --app &lt;app_id&gt;{'\n'}npx clerk env pull</pre>
          </li>
          <li className="rounded-xl border border-line bg-surface p-4">
            <div className="font-semibold">2 · Or paste the key yourself</div>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-canvas p-3 text-[12.5px] text-muted">VITE_CLERK_PUBLISHABLE_KEY=pk_test_…</pre>
            <p className="mt-2 text-[12.5px] text-subtle">
              From the Clerk dashboard → API keys. On Vercel, add the same variable under Project → Settings → Environment Variables.
            </p>
          </li>
        </ol>
      </div>
    </main>
  )
}
