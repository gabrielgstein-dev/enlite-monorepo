export interface DropdownProps {
  label?: string;
  placeholder: string;
  value?: string;
  icon?: string;
  onChange?: (value: string) => void;
  className?: string;
  rounded?: 'sm' | 'md' | 'full';
}

const roundedStyles = {
  sm: 'rounded-[10px]',
  md: 'rounded-xl',
  full: 'rounded-[100px]',
};

export const Dropdown = ({
  label,
  placeholder,
  value,
  icon = 'https://c.animaapp.com/rTGW2XnX/img/vector-9.svg',
  className = '',
  rounded = 'sm',
}: DropdownProps) => {
  const displayValue = value || placeholder;
  const textColorClass = value ? 'text-primary' : 'text-graygray-700';
  
  return (
    <div className={`flex flex-col items-start gap-1 ${className}`}>
      {label && (
        <div className="font-body-mobile-body-16-semibold font-[number:var(--body-mobile-body-16-semibold-font-weight)] text-graygray-800 text-[length:var(--body-mobile-body-16-semibold-font-size)] tracking-[var(--body-mobile-body-16-semibold-letter-spacing)] leading-[var(--body-mobile-body-16-semibold-line-height)] [font-style:var(--body-mobile-body-16-semibold-font-style)]">
          {label}
        </div>
      )}
      <div className={`flex flex-col items-start gap-2.5 px-4 py-3 w-full ${roundedStyles[rounded]} overflow-hidden border-[1.5px] border-solid border-graygray-600 cursor-pointer`}>
        <div className="flex items-center justify-between w-full">
          <div className={`font-body-mobile-body-14-medium font-[number:var(--body-mobile-body-14-medium-font-weight)] text-[length:var(--body-mobile-body-14-medium-font-size)] tracking-[var(--body-mobile-body-14-medium-letter-spacing)] leading-[var(--body-mobile-body-14-medium-line-height)] whitespace-nowrap [font-style:var(--body-mobile-body-14-medium-font-style)] ${textColorClass}`}>
            {displayValue}
          </div>
          <img className="w-3 h-[7px]" alt="Dropdown" src={icon} />
        </div>
      </div>
    </div>
  );
};
