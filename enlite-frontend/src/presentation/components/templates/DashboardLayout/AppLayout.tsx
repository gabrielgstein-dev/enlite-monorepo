import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@presentation/hooks/useAuth';
import { AppSidebar, AppSidebarNavItem } from './AppSidebar';
import { MobileBottomNav } from './MobileBottomNav';

interface AppLayoutProps {
  children: ReactNode;
  navItems?: AppSidebarNavItem[];
  userName?: string;
  userAvatar?: string;
}

const getDefaultNavItems = (t: (key: string) => string): AppSidebarNavItem[] => [
  {
    icon: <img src="https://c.animaapp.com/rTGW2XnX/img/vector.svg" alt="" className="w-6 h-6" />,
    label: t('common.home'),
    href: '/',
  },
  {
    icon: <img src="https://c.animaapp.com/rTGW2XnX/img/vuesax-outline-messages-2@2x.png" alt="" className="w-6 h-6" />,
    label: t('common.communication'),
    subItems: [
      {
        icon: <img src="https://c.animaapp.com/rTGW2XnX/img/vector-2.svg" alt="" className="w-3.5 h-3.5" />,
        label: t('common.notifications'),
        href: '/notifications',
      },
      {
        icon: <img src="https://c.animaapp.com/rTGW2XnX/img/group-237664@2x.png" alt="" className="w-3.5 h-3.5" />,
        label: t('common.chats'),
        href: '/chats',
      },
    ],
  },
];

export function AppLayout({ children, navItems, userName = 'Usuário', userAvatar }: AppLayoutProps): JSX.Element {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  
  const defaultNavItems = getDefaultNavItems(t);
  const finalNavItems = navItems || defaultNavItems;

  const handleLogout = async (): Promise<void> => {
    await logout();
    navigate('/');
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-50">
      <AppSidebar
        navItems={finalNavItems}
        userName={userName}
        userAvatar={userAvatar}
        onMenuClick={handleLogout}
      />

      {/* Mobile top header */}
      <header className="fixed top-0 left-0 right-0 h-14 bg-white border-b border-gray-200 z-30 flex items-center justify-between px-4 md:hidden">
        <div className="flex items-center gap-2">
          <img className="h-7 w-7 object-contain" alt={t('sidebar.logoAlt', 'Enlite')} src="/EnliteMiniLogo.png" />
          <img className="h-6 w-auto object-contain" alt={t('sidebar.logoAlt', 'Enlite')} src="/EnliteNameLogo.png" />
        </div>
        <span className="text-sm font-medium text-gray-700 font-lexend truncate max-w-[160px]">
          {userName}
        </span>
      </header>

      <main className="flex-1 md:ml-[200px] overflow-y-auto pt-14 md:pt-0 pb-20 md:pb-0">
        <div className="container mx-auto p-4 md:p-6">
          {children}
        </div>
      </main>

      <MobileBottomNav navItems={finalNavItems} />
    </div>
  );
}
