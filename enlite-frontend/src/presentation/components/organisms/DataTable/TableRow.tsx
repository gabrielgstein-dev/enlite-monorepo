import { ReactNode } from 'react';

export interface TableRowProps {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}

export const TableRow = ({ children, onClick, className = '' }: TableRowProps) => {
  return (
    <div
      className={`relative w-[986px] h-[72px] rounded-[0px_0px_12px_12px] overflow-hidden border-b [border-bottom-style:solid] border-graygray-600 ${
        onClick ? 'cursor-pointer hover:bg-graygray-100-bg-web transition-colors' : ''
      } ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
};
