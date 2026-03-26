import { Link } from 'react-router-dom';

export interface SidebarMenuItemProps {
  icon: string;
  label: string;
  iconClass?: string;
  href?: string;
  onClick?: () => void;
}

export const SidebarMenuItem = ({
  icon,
  label,
  iconClass = 'relative w-3.5 h-3.5',
  href,
  onClick,
}: SidebarMenuItemProps): JSX.Element => {
  const content = (
    <div className="inline-flex gap-3 flex-[0_0_auto] items-center relative">
      <img className={iconClass} alt={label} src={icon} />
      <div className="relative w-fit mt-[-1.00px] [font-family:'Poppins',Helvetica] font-medium text-primary text-[10px] tracking-[0] leading-[15px] whitespace-nowrap">
        {label}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link to={href} className="flex w-60 items-center gap-4 px-[60px] py-1.5 relative flex-[0_0_auto] hover:bg-gray-100 transition-colors">
        {content}
      </Link>
    );
  }

  return (
    <button onClick={onClick} className="flex w-60 items-center gap-4 px-[60px] py-1.5 relative flex-[0_0_auto] hover:bg-gray-100 transition-colors">
      {content}
    </button>
  );
};
