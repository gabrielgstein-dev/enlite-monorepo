import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { useAuthState } from './hooks/useAuthState';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { RoleBasedHome } from './pages/home/RoleBasedHome';
import { RegisterPage } from './pages/RegisterPage';
import { WorkerRegistrationPage } from './pages/WorkerRegistrationPage';
import { ManagerWorkerRegistrationPage } from './pages/ManagerWorkerRegistrationPage';

function AppContent() {
  const authState = useAuthState();

  return (
    <AuthProvider value={authState}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/worker-registration"
            element={
              <ProtectedRoute redirectTo="/login?next=/worker-registration">
                <WorkerRegistrationPage />
              </ProtectedRoute>
            }
          />
          <Route path="/manager/worker-registration" element={<ManagerWorkerRegistrationPage />} />
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
    </AuthProvider>
  );
}

export function App() {
  return <AppContent />;
}
