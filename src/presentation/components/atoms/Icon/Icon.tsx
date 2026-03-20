import { ReactNode } from 'react';

type IconSize = 'sm' | 'md' | 'lg';

interface IconProps {
  children: ReactNode;
  size?: IconSize;
  className?: string;
  onClick?: () => void;
}

const sizeStyles: Record<IconSize, string> = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
};

export function Icon({
  children,
  size = 'md',
  className = '',
  onClick,
}: IconProps): JSX.Element {
  const Component = onClick ? 'button' : 'span';
  const interactiveStyles = onClick
    ? 'cursor-pointer hover:opacity-80 transition-opacity'
    : '';

  return (
    <Component
      onClick={onClick}
      className={`flex items-center justify-center shrink-0 ${sizeStyles[size]} ${interactiveStyles} ${className}`}
      type={onClick ? 'button' : undefined}
    >
      {children}
    </Component>
  );
}
