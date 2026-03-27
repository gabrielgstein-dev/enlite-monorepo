import { SelectHTMLAttributes, forwardRef, type ChangeEvent } from 'react';
import { Typography } from '@presentation/components/atoms/Typography';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  options: SelectOption[];
  error?: string;
  placeholder?: string;
  borderColor?: string;
  onChange?: (value: string) => void;
  label?: string;
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
  function SelectField(
    {
      options,
      error,
      placeholder = 'Selecione',
      borderColor = '#D9D9D9',
      className = '',
      onChange,
      label,
      ...props
    },
    ref
  ): JSX.Element {
    const borderClass = error ? 'border-red-500' : `border-[${borderColor}]`;

    const handleChange = (event: ChangeEvent<HTMLSelectElement>): void => {
      onChange?.(event.target.value);
    };

    return (
      <div className="flex flex-col gap-1 w-full">
        <div
          className={`flex items-center h-12 px-4 rounded-[10px] border-[1.5px] border-solid ${borderClass} bg-white focus-within:border-primary transition-colors ${className}`}
        >
          <div className="flex justify-between w-full items-center relative">
            <select
              ref={ref}
              className="w-full font-lexend font-medium text-[#374151] text-sm leading-[150%] bg-transparent outline-none appearance-none pr-8 cursor-pointer relative z-10"
              onChange={handleChange}
              {...props}
            >
              <option value="">{placeholder}</option>
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <img
              className="absolute right-0 w-3 h-[7px] pointer-events-none z-0"
              alt="Dropdown"
              src="https://c.animaapp.com/Bbli6X7n/img/vector-9.svg"
            />
          </div>
        </div>
        {error && <Typography variant="caption" className="text-red-500">{error}</Typography>}
      </div>
    );
  }
);
