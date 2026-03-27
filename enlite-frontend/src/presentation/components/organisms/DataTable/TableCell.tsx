import { ReactNode } from 'react';

export interface TableCellProps {
  children: ReactNode;
  position: string;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

const alignStyles = {
  left: '',
  center: 'text-center',
  right: 'text-right',
};

export const TableCell = ({
  children,
  position,
  align = 'left',
  className = '',
}: TableCellProps) => {
  return (
    <div
      className={`absolute top-[calc(50.00%_-_10px)] ${position} font-body-web-body-14-web-medium font-[number:var(--body-web-body-14-web-medium-font-weight)] text-graygray-800 text-[length:var(--body-web-body-14-web-medium-font-size)] tracking-[var(--body-web-body-14-web-medium-letter-spacing)] leading-[var(--body-web-body-14-web-medium-line-height)] [font-style:var(--body-web-body-14-web-medium-font-style)] ${alignStyles[align]} ${className}`}
    >
      {children}
    </div>
  );
};
