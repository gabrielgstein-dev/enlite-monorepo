import { ReactNode, useState } from 'react';

export interface SidebarProps {
  children: ReactNode;
  footer?: ReactNode;
  logo?: string;
  isCollapsible?: boolean;
  defaultCollapsed?: boolean;
  className?: string;
}

export const Sidebar = ({
  children,
  footer,
  logo = 'https://c.animaapp.com/rTGW2XnX/img/frame-3.svg',
  isCollapsible = true,
  defaultCollapsed = false,
  className = '',
}: SidebarProps): JSX.Element => {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  const toggleSidebar = (): void => {
    if (isCollapsible) {
      setIsCollapsed(!isCollapsed);
    }
  };

  return (
    <aside
      className={`fixed top-0 left-0 h-full flex flex-col items-center bg-white shadow-lg transition-all duration-300 z-40 ${
        isCollapsed ? 'w-16' : 'w-60'
      } ${className}`}
    >
      {isCollapsible && (
        <button
          onClick={toggleSidebar}
          className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded-md transition-colors"
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg
            className="w-5 h-5 text-primary"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d={isCollapsed ? 'M4 6h16M4 12h16M4 18h16' : 'M6 18L18 6M6 6l12 12'}
            />
          </svg>
        </button>
      )}

      {!isCollapsed && (
        <>
          <img className="h-[27px] w-[184px] relative mt-[42px]" alt="Logo" src={logo} />
          <nav className="flex flex-1 w-60 relative mt-[15px] flex-col items-start overflow-y-auto">
            {children}
          </nav>
          {footer && <div className="w-full mt-auto">{footer}</div>}
        </>
      )}

      {isCollapsed && (
        <div className="flex flex-col items-center justify-center h-full">
          <img className="w-8 h-8" alt="Logo" src={logo} />
        </div>
      )}
    </aside>
  );
};
