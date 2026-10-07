import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClerkProvider } from '@clerk/react'
import { useStore } from '@/store/store'
import { MissingClerkKey } from './MissingClerkKey'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined

/** skatebored tokens for Clerk's components (Clerk needs concrete colours, not CSS vars). */
const THEMES = {
  dark: {
    colorPrimary: '#f04c4c',
    colorPrimaryForeground: '#160707',
    colorBackground: '#0b0907',
    colorForeground: '#f4dac8',
    colorMutedForeground: 'rgba(244, 218, 200, 0.64)',
    colorMuted: '#141110',
    colorInput: '#141110',
    colorInputForeground: '#f4dac8',
    colorNeutral: '#f4dac8',
    colorBorder: 'rgba(244, 218, 200, 0.16)',
    colorDanger: '#ff6b6b',
  },
  light: {
    colorPrimary: '#e03e3e',
    colorPrimaryForeground: '#ffffff',
    colorBackground: '#ffffff',
    colorForeground: '#1f130b',
    colorMutedForeground: 'rgba(31, 19, 11, 0.66)',
    colorMuted: '#f6efe9',
    colorInput: '#ffffff',
    colorInputForeground: '#1f130b',
    colorNeutral: '#1f130b',
    colorBorder: 'rgba(61, 36, 18, 0.18)',
    colorDanger: '#c92a2a',
  },
}

/** ClerkProvider wired into React Router so Clerk navigates without full reloads. */
export function ClerkWithRouter({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const theme = useStore((s) => s.theme)
  if (!PUBLISHABLE_KEY) return <MissingClerkKey />
  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      routerPush={(to) => navigate(to)}
      routerReplace={(to) => navigate(to, { replace: true })}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/your-work"
      signUpFallbackRedirectUrl="/your-work"
      afterSignOutUrl="/sign-in"
      appearance={{
        variables: {
          ...THEMES[theme],
          fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
          borderRadius: '0.75rem',
        },
      }}
    >
      {children}
    </ClerkProvider>
  )
}
