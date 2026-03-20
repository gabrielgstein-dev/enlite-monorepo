import { Typography } from '@presentation/components/atoms';
import { ReactNode } from 'react';

export interface NavItemProps {
  icon: ReactNode;
  label: string;
  href?: string;
  onClick?: () => void;
  isActive?: boolean;
  isSubItem?: boolean;
  isCollapsed?: boolean;
}

export const NavItem = ({
  icon,
  label,
  href,
  onClick,
  isActive = false,
  isSubItem = false,
  isCollapsed = false,
}: NavItemProps): JSX.Element => {
  const baseStyles = isCollapsed
    ? 'flex w-full items-center justify-center py-3 bg-white hover:bg-gray-50 transition-colors'
    : isSubItem
    ? 'flex w-full items-center gap-2.5 pl-10 pr-3 py-2 bg-white hover:bg-gray-50 transition-colors'
    : 'flex w-full items-center gap-3 px-4 py-2.5 bg-white hover:bg-gray-50 transition-colors';

  const activeStyles = isActive ? 'bg-gray-100' : '';

  const content = isCollapsed ? (
    <div className="w-6 h-6 flex-shrink-0">{icon}</div>
  ) : (
    <>
      <div className={isSubItem ? 'w-4 h-4 flex-shrink-0' : 'w-5 h-5 flex-shrink-0'}>{icon}</div>
      <Typography
        variant={isSubItem ? 'caption' : 'body'}
        weight="medium"
        color="primary"
        className="flex-1"
      >
        {label}
      </Typography>
    </>
  );

  if (href) {
    return (
      <a href={href} className={`${baseStyles} ${activeStyles}`}>
        {content}
      </a>
    );
  }

  return (
    <button onClick={onClick} className={`${baseStyles} ${activeStyles}`}>
      {content}
    </button>
  );
};
