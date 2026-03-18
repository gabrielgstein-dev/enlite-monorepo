export interface SidebarMenuItemProps {
  icon: string;
  label: string;
  iconClass?: string;
  onClick?: () => void;
}

export const SidebarMenuItem = ({
  icon,
  label,
  iconClass = 'relative w-3.5 h-3.5',
  onClick,
}: SidebarMenuItemProps) => {
  return (
    <div
      className="flex w-60 items-center gap-4 px-[60px] py-1.5 relative flex-[0_0_auto] cursor-pointer hover:bg-graygray-100-bg-web transition-colors"
      onClick={onClick}
    >
      <div className="inline-flex items-center gap-3 relative flex-[0_0_auto]">
        <img className={iconClass} alt={label} src={icon} />
        <div className="relative w-fit mt-[-1.00px] [font-family:'Poppins',Helvetica] font-medium text-primary text-[10px] tracking-[0] leading-[15px] whitespace-nowrap">
          {label}
        </div>
      </div>
    </div>
  );
};
