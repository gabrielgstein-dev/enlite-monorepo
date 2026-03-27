import { ReactNode, useState } from 'react';

export interface SidebarMenuSectionProps {
  icon: string;
  label: string;
  children?: ReactNode;
  isExpandable?: boolean;
  defaultExpanded?: boolean;
  iconClass?: string;
}

export const SidebarMenuSection = ({
  icon,
  label,
  children,
  isExpandable = false,
  defaultExpanded = false,
  iconClass = 'relative w-6 h-6',
}: SidebarMenuSectionProps): JSX.Element => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const toggleExpanded = (): void => {
    if (isExpandable) {
      setIsExpanded(!isExpanded);
    }
  };

  return (
    <div className="inline-flex flex-col items-start relative flex-[0_0_auto] w-full">
      <button
        onClick={toggleExpanded}
        className="relative w-60 h-11 bg-[#ffffff] border-t-[0.5px] border-r-[0.5px] border-l-[0.5px] border-solid border-[#d9d9d980] hover:bg-gray-100 transition-colors"
      >
        <div className="inline-flex items-center gap-3.5 relative top-[calc(50.00%_-_12px)] left-[30px]">
          <img className={iconClass} alt={label} src={icon} />
          <div className="relative w-[101px] [font-family:'Poppins',Helvetica] font-medium text-primary text-sm tracking-[0] leading-[18.9px]">
            {label}
          </div>
          {isExpandable && (
            <img
              className={`relative w-1.5 h-[10.5px] transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              alt="Toggle"
              src="https://c.animaapp.com/rTGW2XnX/img/vector-7.svg"
            />
          )}
        </div>
      </button>

      {isExpandable && isExpanded && children}
    </div>
  );
};
