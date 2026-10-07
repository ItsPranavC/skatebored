import { NavLink, Navigate, useParams } from 'react-router-dom'
import { useProjectByKey } from '@/store/store'
import { ColumnsTab } from '@/features/settings/ColumnsTab'
import { AccessTab, ComponentsTab, DetailsTab, FeaturesTab, IssueTypesTab } from '@/features/settings/tabs'
import { cn } from '@/lib/utils'

const TABS = [
  { id: 'details', label: 'Details' },
  { id: 'access', label: 'Access' },
  { id: 'columns', label: 'Board · Columns & statuses' },
  { id: 'components', label: 'Components' },
  { id: 'issuetypes', label: 'Issue types' },
  { id: 'features', label: 'Features' },
] as const

export default function ProjectSettingsPage() {
  const { projectKey, tab = 'details' } = useParams()
  const project = useProjectByKey(projectKey)!
  if (!TABS.some((t) => t.id === tab)) return <Navigate to={`/projects/${project.key}/settings`} replace />
  return (
    <div className="flex min-h-full">
      <nav className="w-56 shrink-0 border-r border-line px-3 py-6" aria-label="Project settings">
        <div className="px-3 pb-2 text-[11px] font-semibold tracking-wide text-subtle uppercase">Project settings</div>
        {TABS.map((t) => (
          <NavLink
            key={t.id}
            to={`/projects/${project.key}/settings/${t.id}`}
            className={() => cn('block rounded-lg px-3 py-2 text-[13px] transition', tab === t.id ? 'bg-accent-soft font-semibold text-accent' : 'text-fg hover:bg-hover')}
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      <div className="min-w-0 flex-1 px-8 py-6">
        <div className="mb-4 text-[13px] text-muted">
          Projects / {project.name} / Project settings
        </div>
        {tab === 'details' && <DetailsTab project={project} />}
        {tab === 'access' && <AccessTab project={project} />}
        {tab === 'columns' && <ColumnsTab project={project} />}
        {tab === 'components' && <ComponentsTab project={project} />}
        {tab === 'issuetypes' && <IssueTypesTab project={project} />}
        {tab === 'features' && <FeaturesTab project={project} />}
      </div>
    </div>
  )
}
