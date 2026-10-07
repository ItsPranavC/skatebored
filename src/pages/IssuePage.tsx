import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useStore } from '@/store/store'
import { IssueView } from '@/features/issue/IssueView'
import { PillButton } from '@/components/ui/primitives'
import { useNavigate } from 'react-router-dom'

export default function IssuePage() {
  const { issueKey = '' } = useParams()
  const navigate = useNavigate()
  const issue = useStore((s) => s.issues.find((i) => i.key.toLowerCase() === issueKey.toLowerCase()))
  const pushRecent = useStore((s) => s.pushRecent)

  useEffect(() => {
    if (issue) {
      pushRecent({ kind: 'issue', id: issue.id })
      document.title = `[${issue.key}] ${issue.summary} · skatebored`
    }
    return () => {
      document.title = 'skatebored · scrum'
    }
  }, [issue?.id, issue?.key, issue?.summary]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!issue)
    return (
      <div className="grid min-h-full place-items-center p-10">
        <div className="max-w-lg">
          <h1 className="display text-5xl">
            {issueKey.toUpperCase()} <span className="text-accent">not found.</span>
          </h1>
          <p className="mt-3 text-muted">The issue doesn’t exist, was deleted, or you don’t have permission to view it.</p>
          <div className="mt-6 flex items-center gap-4">
            <PillButton onClick={() => navigate('/issues')}>Search issues</PillButton>
            <Link to="/your-work" className="text-sm text-muted hover:text-fg hover:underline">
              Back to your work
            </Link>
          </div>
        </div>
      </div>
    )

  return (
    <div className="mx-auto max-w-[1400px]">
      <IssueView key={issue.id} issue={issue} variant="page" />
    </div>
  )
}
