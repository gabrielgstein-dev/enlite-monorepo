import { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'outline' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
  fullWidth?: boolean;
  borderColor?: string;
  textColor?: string;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white border-primary',
  outline: 'bg-transparent border-2',
  ghost: 'bg-transparent border-0',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-4 py-2 text-sm h-10',
  md: 'px-6 py-3 text-base h-12',
  lg: 'px-6 py-4 text-lg h-[52px]',
};

export const Button = ({
  variant = 'primary',
  size = 'md',
  children,
  fullWidth = false,
  borderColor,
  textColor,
  className = '',
  ...props
}: ButtonProps) => {
  const baseStyles = 'rounded-full overflow-hidden border-solid transition-all duration-200 font-head-web-head-16-web font-[number:var(--head-web-head-16-web-font-weight)] text-[length:var(--head-web-head-16-web-font-size)] text-center tracking-[var(--head-web-head-16-web-letter-spacing)] leading-[var(--head-web-head-16-web-line-height)] [font-style:var(--head-web-head-16-web-font-style)] flex items-center justify-center';
  
  const widthStyle = fullWidth ? 'w-full' : '';
  const customBorderColor = borderColor ? `border-[${borderColor}]` : '';
  const customTextColor = textColor ? `text-[${textColor}]` : '';
  
  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${widthStyle} ${customBorderColor} ${customTextColor} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
