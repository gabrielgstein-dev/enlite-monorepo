import { ReactNode, useState } from 'react';

export interface SidebarProps {
  children: ReactNode;
  footer?: ReactNode;
  logo?: string;
  isCollapsible?: boolean;
  defaultCollapsed?: boolean;
}

export const Sidebar = ({
  children,
  footer,
  logo = 'https://c.animaapp.com/rTGW2XnX/img/frame-3.svg',
  isCollapsible = true,
  defaultCollapsed = false,
}: SidebarProps) => {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  const toggleSidebar = () => {
    if (isCollapsible) {
      setIsCollapsed(!isCollapsed);
    }
  };

  return (
    <div
      className={`fixed top-0 left-0 h-full flex flex-col items-center bg-white transition-all duration-300 ${
        isCollapsed ? 'w-16' : 'w-60'
      }`}
    >
      {isCollapsible && (
        <button
          onClick={toggleSidebar}
          className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center hover:bg-graygray-100-bg-web rounded-md transition-colors"
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
          <div className="flex h-[524px] w-60 relative mt-[15.0px] flex-col items-start overflow-y-auto">
            {children}
          </div>
          {footer && <div className="mt-auto">{footer}</div>}
        </>
      )}
    </div>
  );
};
