import { ReactNode, useState } from 'react';

export interface SidebarMenuSectionProps {
  icon: string;
  label: string;
  children?: ReactNode;
  isExpandable?: boolean;
  defaultExpanded?: boolean;
  onClick?: () => void;
}

export const SidebarMenuSection = ({
  icon,
  label,
  children,
  isExpandable = false,
  defaultExpanded = false,
  onClick,
}: SidebarMenuSectionProps) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const handleClick = () => {
    if (isExpandable) {
      setIsExpanded(!isExpanded);
    }
    onClick?.();
  };

  return (
    <div className="inline-flex flex-col items-start relative flex-[0_0_auto]">
      <div
        className="relative w-60 h-11 bg-[#ffffff] border-t-[0.5px] [border-top-style:solid] border-r-[0.5px] [border-right-style:solid] border-l-[0.5px] [border-left-style:solid] border-[#d9d9d980] cursor-pointer hover:bg-graygray-100-bg-web transition-colors"
        onClick={handleClick}
      >
        <div className="inline-flex items-center gap-3.5 relative top-[calc(50.00%_-_12px)] left-[30px]">
          <img className="relative w-6 h-6" alt={label} src={icon} />
          <div className="relative w-[101px] [font-family:'Poppins',Helvetica] font-medium text-primary text-sm tracking-[0] leading-[18.9px]">
            {label}
          </div>
          {isExpandable && (
            <img
              className={`relative w-1.5 h-[10.5px] transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              alt="Expand"
              src="https://c.animaapp.com/rTGW2XnX/img/vector-7.svg"
            />
          )}
        </div>
      </div>
      {isExpandable && isExpanded && children}
    </div>
  );
};
