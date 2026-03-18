import { ReactNode } from 'react';

export interface CardProps {
  children: ReactNode;
  className?: string;
  borderColor?: string;
  backgroundColor?: string;
  rounded?: 'sm' | 'md' | 'lg' | 'xl';
}

const roundedStyles = {
  sm: 'rounded-lg',
  md: 'rounded-xl',
  lg: 'rounded-2xl',
  xl: 'rounded-[28px]',
};

export const Card = ({
  children,
  className = '',
  borderColor,
  backgroundColor = 'bg-white',
  rounded = 'xl',
}: CardProps) => {
  const borderStyle = borderColor ? `border-[3px] border-solid border-${borderColor}` : '';
  
  return (
    <div className={`${backgroundColor} ${roundedStyles[rounded]} ${borderStyle} ${className}`}>
      {children}
    </div>
  );
};
