import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout, PlainLayout, ProjectLayout } from '@/layout/AppLayout'
import { Spinner } from '@/components/ui/primitives'
import { ClerkWithRouter } from '@/auth/ClerkWithRouter'
import { RequireAuth } from '@/auth/RequireAuth'
const AuthPage = lazy(() => import('@/auth/AuthPage'))
const BoardPage = lazy(() => import('@/pages/BoardPage'))
const SprintsPage = lazy(() => import('@/pages/SprintsPage'))
const IssuePage = lazy(() => import('@/pages/IssuePage'))
const DashboardsPage = lazy(() => import('@/pages/DashboardsPage'))
const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const ProjectsPage = lazy(() => import('@/pages/ProjectsPage'))
const ProjectSettingsPage = lazy(() => import('@/pages/ProjectSettingsPage'))
const PeoplePage = lazy(() => import('@/pages/PeoplePage'))
const IssuesSearchPage = lazy(() => import('@/pages/IssuesSearchPage'))
const FiltersPage = lazy(() => import('@/pages/FiltersPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))
const AgentsPage = lazy(() => import('@/pages/AgentsPage'))
const CalendarPage = lazy(() => import('@/pages/CalendarPage'))
const MeetingsPage = lazy(() => import('@/pages/MeetingsPage'))

export default function App() {
  return (
    <BrowserRouter>
      <ClerkWithRouter>
        <Suspense
          fallback={
            <div className="grid h-full place-items-center">
              <Spinner />
            </div>
          }
        >
          <Routes>
            <Route path="sign-in/*" element={<AuthPage mode="sign-in" />} />
            <Route path="sign-up/*" element={<AuthPage mode="sign-up" />} />
            <Route element={<RequireAuth />}>
              <Route element={<AppLayout />}>
                <Route index element={<Navigate to="/projects" replace />} />
                <Route element={<PlainLayout />}>
                  <Route path="your-work" element={<Navigate to="/projects" replace />} />
                  <Route path="projects" element={<ProjectsPage />} />
                  <Route path="issues" element={<IssuesSearchPage />} />
                  <Route path="filters" element={<FiltersPage />} />
                  <Route path="dashboards" element={<DashboardsPage />} />
                  <Route path="dashboards/:dashboardId" element={<DashboardPage />} />
                  <Route path="agents" element={<AgentsPage />} />
                  <Route path="calendar" element={<CalendarPage />} />
                  <Route path="meetings" element={<MeetingsPage />} />
                  <Route path="meetings/:meetingId" element={<MeetingsPage />} />
                  <Route path="people" element={<PeoplePage />} />
                  <Route path="people/:userId" element={<PeoplePage />} />
                  <Route path="browse/:issueKey" element={<IssuePage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Route>
                <Route path="projects/:projectKey" element={<ProjectLayout />}>
                  <Route index element={<Navigate to="sprints" replace />} />
                  <Route path="sprints" element={<SprintsPage />} />
                  <Route path="board" element={<BoardPage />} />
                  {/* Backlog, timeline, reports, issues and releases were removed to keep projects simple. */}
                  {['backlog', 'timeline', 'reports/*', 'issues', 'releases/*'].map((p) => (
                    <Route key={p} path={p} element={<Navigate to="../sprints" replace />} />
                  ))}
                  <Route path="settings" element={<ProjectSettingsPage />} />
                  <Route path="settings/:tab" element={<ProjectSettingsPage />} />
                </Route>
              </Route>
            </Route>
          </Routes>
        </Suspense>
      </ClerkWithRouter>
    </BrowserRouter>
  )
}
