import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/features/auth/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { RoleBasedHome } from './pages/home/RoleBasedHome';
import { RegisterPage } from './pages/RegisterPage';
import { WorkerProfilePage } from './pages/WorkerProfilePage';

// Admin module — lazy-loaded for code splitting
const AdminLoginPage = lazy(() => import('./pages/admin/AdminLoginPage').then(m => ({ default: m.AdminLoginPage })));
const AdminChangePasswordPage = lazy(() => import('./pages/admin/AdminChangePasswordPage').then(m => ({ default: m.AdminChangePasswordPage })));
const AdminUsersPage = lazy(() => import('./pages/admin/AdminUsersPage').then(m => ({ default: m.AdminUsersPage })));
const AdminUploadsPage = lazy(() => import('./pages/admin/AdminUploadsPage').then(m => ({ default: m.AdminUploadsPage })));
const AdminLayout = lazy(() => import('./components/templates/AdminLayout/AdminLayout').then(m => ({ default: m.AdminLayout })));
const AdminProtectedRoute = lazy(() => import('./components/features/admin/AdminProtectedRoute').then(m => ({ default: m.AdminProtectedRoute })));

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
          <Suspense fallback={<AdminFallback />}><AdminLoginPage /></Suspense>
        } />
        <Route path="/admin/change-password" element={
          <Suspense fallback={<AdminFallback />}><AdminChangePasswordPage /></Suspense>
        } />
        <Route path="/admin" element={
          <Suspense fallback={<AdminFallback />}>
            <AdminProtectedRoute>
              <AdminLayout><AdminUsersPage /></AdminLayout>
            </AdminProtectedRoute>
          </Suspense>
        } />
        <Route path="/admin/uploads" element={
          <Suspense fallback={<AdminFallback />}>
            <AdminProtectedRoute>
              <AdminLayout><AdminUploadsPage /></AdminLayout>
            </AdminProtectedRoute>
          </Suspense>
        } />
      </Routes>
    </BrowserRouter>
  );
}
