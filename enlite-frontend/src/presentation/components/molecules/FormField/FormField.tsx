import { ReactNode } from 'react';
import { Label } from '@presentation/components/atoms';

interface FormFieldProps {
  label: string;
  error?: string;
  required?: boolean;
  optional?: boolean;
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}

export function FormField({
  label,
  error,
  required = false,
  optional = false,
  children,
  htmlFor,
  className = '',
}: FormFieldProps): JSX.Element {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <Label htmlFor={htmlFor} required={required} optional={optional}>
        {label}
      </Label>
      {children}
      {error && <span className="text-red-500 text-xs">{error}</span>}
    </div>
  );
}
