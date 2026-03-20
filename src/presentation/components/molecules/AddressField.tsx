import { forwardRef } from 'react';

interface AddressFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  containerClassName?: string;
}

export const AddressField = forwardRef<HTMLInputElement, AddressFieldProps>(
  ({ label, error, containerClassName = '', className = '', ...props }, ref) => {
    return (
      <div className={`flex flex-col h-[74px] items-start gap-1 relative ${containerClassName}`}>
        <label className="relative w-fit mt-[-1.00px] font-lexend font-semibold text-[#374151] text-[16px] leading-[150%] whitespace-nowrap">
          {label}
        </label>
        <div className={`relative self-stretch w-full h-12 rounded-[10px] overflow-hidden border-[1.5px] border-solid transition-colors ${error ? 'border-red-500' : 'border-[#4B5563] focus-within:border-primary'}`}>
          <input
            ref={ref}
            className={`absolute top-0 left-0 w-full h-full px-4 font-lexend font-medium text-[#374151] text-[14px] leading-[150%] bg-transparent outline-none placeholder:text-[#9CA3AF] ${className}`}
            {...props}
          />
        </div>
        {error && <span className="absolute -bottom-5 text-red-500 text-xs">{error}</span>}
      </div>
    );
  }
);

AddressField.displayName = 'AddressField';
