import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '@presentation/hooks/useAdminAuth';
import { useAdminNavItems } from '@presentation/config/adminNavigation';
import { AppSidebar } from '@presentation/components/templates/DashboardLayout';

interface AdminLayoutProps {
  children: ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const { logout, adminProfile } = useAdminAuth();
  const navigate = useNavigate();
  const navItems = useAdminNavItems();

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
        <div className="container mx-auto p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
