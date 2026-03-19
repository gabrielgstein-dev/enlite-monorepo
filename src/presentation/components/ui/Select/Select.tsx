export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  label?: string;
  className?: string;
}

export const Select = ({
  value,
  onChange,
  options,
  label,
  className = '',
}: SelectProps): JSX.Element => {
  return (
    <div className={className}>
      {label && (
        <label className="block font-lexend font-semibold text-[#737373] text-base mb-1">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-4 py-3 rounded-[10px] border-[1.5px] border-[#D9D9D9] font-lexend font-medium text-sm text-[#180149] bg-white appearance-none cursor-pointer focus:outline-none focus:ring-0"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  );
};
