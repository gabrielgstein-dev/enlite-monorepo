import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@presentation/hooks/useAuth';
import { AppSidebar, AppSidebarNavItem } from './AppSidebar';

interface AppLayoutProps {
  children: ReactNode;
  navItems?: AppSidebarNavItem[];
  userName?: string;
  userAvatar?: string;
}

const defaultNavItems: AppSidebarNavItem[] = [
  {
    icon: <img src="https://c.animaapp.com/rTGW2XnX/img/vector.svg" alt="" className="w-6 h-6" />,
    label: 'Home',
    href: '/',
  },
  {
    icon: <img src="https://c.animaapp.com/rTGW2XnX/img/vuesax-outline-messages-2@2x.png" alt="" className="w-6 h-6" />,
    label: 'Comunicação',
    subItems: [
      {
        icon: <img src="https://c.animaapp.com/rTGW2XnX/img/vector-2.svg" alt="" className="w-3.5 h-3.5" />,
        label: 'Notificações',
        href: '/notifications',
      },
      {
        icon: <img src="https://c.animaapp.com/rTGW2XnX/img/group-237664@2x.png" alt="" className="w-3.5 h-3.5" />,
        label: 'Chats',
        href: '/chats',
      },
    ],
  },
];

export function AppLayout({ children, navItems = defaultNavItems, userName = 'Usuário', userAvatar }: AppLayoutProps): JSX.Element {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async (): Promise<void> => {
    await logout();
    navigate('/');
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-50">
      <AppSidebar
        navItems={navItems}
        userName={userName}
        userAvatar={userAvatar}
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
