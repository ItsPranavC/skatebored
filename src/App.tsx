import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout, PlainLayout, ProjectLayout } from '@/layout/AppLayout'
import { Spinner } from '@/components/ui/primitives'
const BoardPage = lazy(() => import('@/pages/BoardPage'))
const BacklogPage = lazy(() => import('@/pages/BacklogPage'))
const IssuePage = lazy(() => import('@/pages/IssuePage'))
const ReportsPage = lazy(() => import('@/pages/ReportsPage'))
const DashboardsPage = lazy(() => import('@/pages/DashboardsPage'))
const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const ProjectsPage = lazy(() => import('@/pages/ProjectsPage'))
const TimelinePage = lazy(() => import('@/pages/TimelinePage'))
const ReleasesPage = lazy(() => import('@/pages/ReleasesPage'))
const ProjectSettingsPage = lazy(() => import('@/pages/ProjectSettingsPage'))
const PeoplePage = lazy(() => import('@/pages/PeoplePage'))
const IssuesSearchPage = lazy(() => import('@/pages/IssuesSearchPage'))
const FiltersPage = lazy(() => import('@/pages/FiltersPage'))
const YourWorkPage = lazy(() => import('@/pages/YourWorkPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="grid h-full place-items-center"><Spinner /></div>}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/your-work" replace />} />
          <Route element={<PlainLayout />}>
            <Route path="your-work" element={<YourWorkPage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="issues" element={<IssuesSearchPage />} />
            <Route path="filters" element={<FiltersPage />} />
            <Route path="dashboards" element={<DashboardsPage />} />
            <Route path="dashboards/:dashboardId" element={<DashboardPage />} />
            <Route path="people" element={<PeoplePage />} />
            <Route path="people/:userId" element={<PeoplePage />} />
            <Route path="browse/:issueKey" element={<IssuePage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
          <Route path="projects/:projectKey" element={<ProjectLayout />}>
            <Route index element={<Navigate to="board" replace />} />
            <Route path="board" element={<BoardPage />} />
            <Route path="backlog" element={<BacklogPage />} />
            <Route path="timeline" element={<TimelinePage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="reports/:report" element={<ReportsPage />} />
            <Route path="issues" element={<IssuesSearchPage />} />
            <Route path="releases" element={<ReleasesPage />} />
            <Route path="releases/:versionId" element={<ReleasesPage />} />
            <Route path="settings" element={<ProjectSettingsPage />} />
            <Route path="settings/:tab" element={<ProjectSettingsPage />} />
          </Route>
        </Route>
      </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
