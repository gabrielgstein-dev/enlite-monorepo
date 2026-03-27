import { Outlet, useLocation } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '@presentation/hooks/useAdminAuth';
import { useAdminNavItems } from '@presentation/config/adminNavigation';
import { AppSidebar } from '@presentation/components/templates/DashboardLayout';

export function AdminLayout() {
  const { logout, adminProfile } = useAdminAuth();
  const navigate = useNavigate();
  const navItems = useAdminNavItems();
  const location = useLocation();

  const handleLogout = async () => {
    await logout();
    navigate('/admin/login');
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-50">
      <AppSidebar
        navItems={navItems}
        userName={adminProfile?.displayName || adminProfile?.email || 'Admin'}
        onMenuClick={handleLogout}
      />

      <main className="flex-1 ml-[200px] overflow-y-auto">
        <div key={location.pathname} className="container mx-auto p-6 page-enter">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
