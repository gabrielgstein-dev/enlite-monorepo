import { ReactNode } from 'react';

export interface TableColumn {
  key: string;
  label: string;
  position: string;
  align?: 'left' | 'center' | 'right';
}

export interface TableProps {
  columns: TableColumn[];
  children: ReactNode;
  className?: string;
}

export const Table = ({ columns, children, className = '' }: TableProps) => {
  return (
    <div className={`inline-flex flex-col items-start relative ${className}`}>
      <div className="relative w-[986px] h-11 bg-graygray-300 rounded-[12px_12px_0px_0px] overflow-hidden border-b [border-bottom-style:solid] border-graygray-600">
        {columns.map((column) => (
          <div
            key={column.key}
            className={`absolute top-[11px] ${column.position} font-body-web-body-16-web-medium font-[number:var(--body-web-body-16-web-medium-font-weight)] text-graygray-800 text-[length:var(--body-web-body-16-web-medium-font-size)] tracking-[var(--body-web-body-16-web-medium-letter-spacing)] leading-[var(--body-web-body-16-web-medium-line-height)] whitespace-nowrap [font-style:var(--body-web-body-16-web-medium-font-style)]`}
          >
            {column.label}
          </div>
        ))}
      </div>
      {children}
    </div>
  );
};
