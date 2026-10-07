import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout, PlainLayout, ProjectLayout } from '@/layout/AppLayout'
import BoardPage from '@/pages/BoardPage'
import BacklogPage from '@/pages/BacklogPage'
import IssuePage from '@/pages/IssuePage'
import ReportsPage from '@/pages/ReportsPage'
import DashboardsPage from '@/pages/DashboardsPage'
import DashboardPage from '@/pages/DashboardPage'
import ProjectsPage from '@/pages/ProjectsPage'
import TimelinePage from '@/pages/TimelinePage'
import ReleasesPage from '@/pages/ReleasesPage'
import ProjectSettingsPage from '@/pages/ProjectSettingsPage'
import PeoplePage from '@/pages/PeoplePage'
import IssuesSearchPage from '@/pages/IssuesSearchPage'
import FiltersPage from '@/pages/FiltersPage'
import YourWorkPage from '@/pages/YourWorkPage'
import NotFoundPage from '@/pages/NotFoundPage'

export default function App() {
  return (
    <BrowserRouter>
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
    </BrowserRouter>
  )
}
