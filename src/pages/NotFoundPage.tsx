import { useNavigate } from 'react-router-dom'
import { PillButton } from '@/components/ui/primitives'

export default function NotFoundPage() {
  const navigate = useNavigate()
  return (
    <div className="grid min-h-full place-items-center p-10">
      <div className="max-w-xl">
        <h1 className="display text-[clamp(3rem,8vw,6rem)]">
          bailed <span className="text-accent">on that one.</span>
        </h1>
        <p className="mt-4 text-lg text-muted">This page doesn’t exist, or it was moved. Let’s get you back on the board.</p>
        <PillButton className="mt-8" onClick={() => navigate('/your-work')}>
          Back to your work
        </PillButton>
      </div>
    </div>
  )
}
