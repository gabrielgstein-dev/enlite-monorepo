import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/features/auth/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { RoleBasedHome } from './pages/home/RoleBasedHome';
import { RegisterPage } from './pages/RegisterPage';
import { WorkerProfilePage } from './pages/WorkerProfilePage';

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
      </Routes>
    </BrowserRouter>
  );
}
