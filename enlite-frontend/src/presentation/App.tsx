import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/features/auth/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { RoleBasedHome } from './pages/home/RoleBasedHome';
import { RegisterPage } from './pages/RegisterPage';
import { WorkerProfilePage } from './pages/WorkerProfilePage';
import { AdminErrorBoundary } from './components/features/admin/AdminErrorBoundary';

// Import direto — páginas e layout carregam junto com o bundle admin
import { AdminLayout } from './components/templates/AdminLayout/AdminLayout';
import { AdminLoginPage } from './pages/admin/AdminLoginPage';
import { AdminChangePasswordPage } from './pages/admin/AdminChangePasswordPage';
import { AdminUsersPage } from './pages/admin/AdminUsersPage';
import { AdminUploadsPage } from './pages/admin/AdminUploadsPage';
import { AdminVacanciesPage } from './pages/admin/AdminVacanciesPage';
import { AdminRecruitmentPage } from './pages/admin/AdminRecruitmentPage';
import { AdminWorkersPage } from './pages/admin/AdminWorkersPage';
import VacancyDetailPage from './pages/admin/VacancyDetailPage';
import VacancyMatchPage from './pages/admin/VacancyMatchPage';
import { MessageStatsPage } from './pages/admin/MessageStatsPage';

// Mantém lazy — são a fronteira worker/admin; carregados uma única vez
const AdminProtectedRoute = lazy(() => import('./components/features/admin/AdminProtectedRoute').then(m => ({ default: m.AdminProtectedRoute })));
const AdminLoginGuard = lazy(() => import('./components/features/admin/AdminLoginGuard').then(m => ({ default: m.AdminLoginGuard })));

const AdminFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
  </div>
);

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/worker-registration"
          element={<Navigate to="/worker/profile" replace />}
        />
        <Route
          path="/worker/profile"
          element={
            <ProtectedRoute redirectTo="/login?next=/worker/profile">
              <WorkerProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <RoleBasedHome />
            </ProtectedRoute>
          }
        />

        {/* Admin module — lazy-loaded, isolated from worker module */}
        <Route path="/admin/login" element={
          <AdminErrorBoundary>
            <Suspense fallback={<AdminFallback />}>
              <AdminLoginGuard>
                <AdminLoginPage />
              </AdminLoginGuard>
            </Suspense>
          </AdminErrorBoundary>
        } />
        <Route path="/admin/change-password" element={
          <AdminErrorBoundary>
            <AdminChangePasswordPage />
          </AdminErrorBoundary>
        } />

        {/* Nested routes — AdminLayout is the persistent shell */}
        <Route
          path="/admin"
          element={
            <AdminErrorBoundary>
              <Suspense fallback={<AdminFallback />}>
                <AdminProtectedRoute>
                  <AdminLayout />
                </AdminProtectedRoute>
              </Suspense>
            </AdminErrorBoundary>
          }
        >
          <Route index element={<AdminUsersPage />} />
          <Route path="uploads" element={<AdminUploadsPage />} />
          <Route path="vacancies" element={<AdminVacanciesPage />} />
          <Route path="vacancies/:id" element={<VacancyDetailPage />} />
          <Route path="vacancies/:id/match" element={<VacancyMatchPage />} />
          <Route path="recruitment" element={<AdminRecruitmentPage />} />
          <Route path="workers" element={<AdminWorkersPage />} />
          <Route path="messaging" element={<MessageStatsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
