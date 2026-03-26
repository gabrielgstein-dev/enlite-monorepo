import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/features/auth/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { RoleBasedHome } from './pages/home/RoleBasedHome';
import { RegisterPage } from './pages/RegisterPage';
import { WorkerProfilePage } from './pages/WorkerProfilePage';
import { AdminErrorBoundary } from './components/features/admin/AdminErrorBoundary';

// Admin module — lazy-loaded for code splitting
const AdminLoginPage = lazy(() => import('./pages/admin/AdminLoginPage').then(m => ({ default: m.AdminLoginPage })));
const AdminChangePasswordPage = lazy(() => import('./pages/admin/AdminChangePasswordPage').then(m => ({ default: m.AdminChangePasswordPage })));
const AdminUsersPage = lazy(() => import('./pages/admin/AdminUsersPage').then(m => ({ default: m.AdminUsersPage })));
const AdminUploadsPage = lazy(() => import('./pages/admin/AdminUploadsPage').then(m => ({ default: m.AdminUploadsPage })));
const AdminVacanciesPage = lazy(() => import('./pages/admin/AdminVacanciesPage').then(m => ({ default: m.AdminVacanciesPage })));
const AdminRecruitmentPage = lazy(() => import('./pages/admin/AdminRecruitmentPage').then(m => ({ default: m.AdminRecruitmentPage })));
const VacancyDetailPage = lazy(() => import('./pages/admin/VacancyDetailPage'));
const VacancyMatchPage  = lazy(() => import('./pages/admin/VacancyMatchPage'));
const AdminLayout = lazy(() => import('./components/templates/AdminLayout/AdminLayout').then(m => ({ default: m.AdminLayout })));
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
            <Suspense fallback={<AdminFallback />}><AdminChangePasswordPage /></Suspense>
          </AdminErrorBoundary>
        } />
        <Route path="/admin" element={
          <AdminErrorBoundary>
            <Suspense fallback={<AdminFallback />}>
              <AdminProtectedRoute>
                <AdminLayout><AdminUsersPage /></AdminLayout>
              </AdminProtectedRoute>
            </Suspense>
          </AdminErrorBoundary>
        } />
        <Route path="/admin/uploads" element={
          <AdminErrorBoundary>
            <Suspense fallback={<AdminFallback />}>
              <AdminProtectedRoute>
                <AdminLayout><AdminUploadsPage /></AdminLayout>
              </AdminProtectedRoute>
            </Suspense>
          </AdminErrorBoundary>
        } />
        <Route path="/admin/vacancies" element={
          <AdminErrorBoundary>
            <Suspense fallback={<AdminFallback />}>
              <AdminProtectedRoute>
                <AdminLayout><AdminVacanciesPage /></AdminLayout>
              </AdminProtectedRoute>
            </Suspense>
          </AdminErrorBoundary>
        } />
        <Route path="/admin/recruitment" element={
          <AdminErrorBoundary>
            <Suspense fallback={<AdminFallback />}>
              <AdminProtectedRoute>
                <AdminLayout><AdminRecruitmentPage /></AdminLayout>
              </AdminProtectedRoute>
            </Suspense>
          </AdminErrorBoundary>
        } />
        <Route path="/admin/vacancies/:id" element={
          <AdminErrorBoundary>
            <Suspense fallback={<AdminFallback />}>
              <AdminProtectedRoute>
                <AdminLayout><VacancyDetailPage /></AdminLayout>
              </AdminProtectedRoute>
            </Suspense>
          </AdminErrorBoundary>
        } />
        <Route path="/admin/vacancies/:id/match" element={
          <AdminErrorBoundary>
            <Suspense fallback={<AdminFallback />}>
              <AdminProtectedRoute>
                <AdminLayout><VacancyMatchPage /></AdminLayout>
              </AdminProtectedRoute>
            </Suspense>
          </AdminErrorBoundary>
        } />
      </Routes>
    </BrowserRouter>
  );
}
