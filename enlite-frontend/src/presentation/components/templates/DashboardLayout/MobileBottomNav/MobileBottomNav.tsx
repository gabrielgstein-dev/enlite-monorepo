import { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

interface MobileBottomNavItem {
  icon: ReactNode;
  label: string;
  href?: string;
  enabled?: boolean;
}

interface MobileBottomNavProps {
  navItems: MobileBottomNavItem[];
}

export const MobileBottomNav = ({ navItems }: MobileBottomNavProps): JSX.Element => {
  const visibleItems = navItems.filter((item) => item.enabled !== false && item.href);

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 md:hidden safe-area-pb">
      <div className="flex items-center justify-around h-16">
        {visibleItems.map((item, index) => (
          <NavLink
            key={index}
            to={item.href!}
            end={item.href === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-1 px-3 py-2 flex-1 transition-colors ${
                isActive ? 'text-primary' : 'text-gray-400'
              }`
            }
          >
            <span className="w-6 h-6 flex items-center justify-center">{item.icon}</span>
            <span className="text-[10px] font-medium font-lexend leading-none">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
};
