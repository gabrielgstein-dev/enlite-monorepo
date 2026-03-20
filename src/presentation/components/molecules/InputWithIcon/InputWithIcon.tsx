import { InputHTMLAttributes, ReactNode, forwardRef } from 'react';
import { Typography } from '@presentation/components/atoms/Typography';

interface InputWithIconProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode;
  iconPosition?: 'left' | 'right';
  error?: string;
  borderColor?: string;
}

export const InputWithIcon = forwardRef<HTMLInputElement, InputWithIconProps>(
  function InputWithIcon(
    {
      icon,
      iconPosition = 'right',
      error,
      borderColor = '#D9D9D9',
      className = '',
      ...props
    },
    ref
  ): JSX.Element {
  const borderClass = error ? 'border-red-500' : `border-[${borderColor}]`;
  
  return (
    <div className="flex flex-col gap-1 w-full">
      <div
        className={`flex items-center h-12 px-4 rounded-[10px] border-[1.5px] border-solid ${borderClass} bg-white gap-2 focus-within:border-primary transition-colors ${className}`}
      >
        {iconPosition === 'left' && icon && (
          <span className="flex items-center shrink-0">{icon}</span>
        )}
        <input
          ref={ref}
          className="flex-1 border-none outline-none font-lexend text-sm font-medium text-gray-800 bg-transparent placeholder:text-gray-600"
          {...props}
        />
        {iconPosition === 'right' && icon && (
          <span className="flex items-center shrink-0">{icon}</span>
        )}
      </div>
      {error && <Typography variant="caption" className="text-red-500">{error}</Typography>}
    </div>
  );
  }
);
