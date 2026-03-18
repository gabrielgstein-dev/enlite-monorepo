import { InputHTMLAttributes } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: string;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  rounded?: 'sm' | 'md' | 'full';
}

const roundedStyles = {
  sm: 'rounded-[10px]',
  md: 'rounded-xl',
  full: 'rounded-[100px]',
};

export const Input = ({
  icon,
  iconPosition = 'right',
  fullWidth = true,
  rounded = 'full',
  className = '',
  ...props
}: InputProps) => {
  const widthStyle = fullWidth ? 'w-full' : '';
  
  return (
    <div className={`flex flex-col items-start gap-2.5 px-4 py-3 ${roundedStyles[rounded]} overflow-hidden border-[1.5px] border-solid border-graygray-600 ${widthStyle} ${className}`}>
      <div className="flex items-center justify-between w-full">
        {iconPosition === 'left' && icon && (
          <img className="w-6 h-6" alt="Icon" src={icon} />
        )}
        <input
          className="flex-1 bg-transparent border-0 outline-none text-graygray-800 font-body-mobile-body-14-medium font-[number:var(--body-mobile-body-14-medium-font-weight)] text-[length:var(--body-mobile-body-14-medium-font-size)] tracking-[var(--body-mobile-body-14-medium-letter-spacing)] leading-[var(--body-mobile-body-14-medium-line-height)] [font-style:var(--body-mobile-body-14-medium-font-style)] placeholder:text-graygray-800"
          {...props}
        />
        {iconPosition === 'right' && icon && (
          <img className="w-6 h-6" alt="Icon" src={icon} />
        )}
      </div>
    </div>
  );
};
