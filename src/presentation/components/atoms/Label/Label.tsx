import { LabelHTMLAttributes, ReactNode } from 'react';

interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  children: ReactNode;
  required?: boolean;
  optional?: boolean;
}

export function Label({
  children,
  required = false,
  optional = false,
  className = '',
  ...props
}: LabelProps): JSX.Element {
  return (
    <label
      className={`font-lexend font-semibold text-gray-800 text-base leading-[150%] ${className}`}
      {...props}
    >
      {children}
      {required && <span className="text-red-500 ml-1">*</span>}
      {optional && (
        <span className="font-normal text-xs text-[#b0b0b0] ml-2">(opcional)</span>
      )}
    </label>
  );
}
