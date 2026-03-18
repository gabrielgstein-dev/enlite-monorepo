import { useState, useRef, useEffect } from 'react';

interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  error?: string;
  label?: string;
}

export function MultiSelect({ options, value, onChange, placeholder, error, label }: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (optionValue: string): void => {
    if (value.includes(optionValue)) {
      onChange(value.filter((v) => v !== optionValue));
    } else {
      onChange([...value, optionValue]);
    }
  };

  const getDisplayText = (): string => {
    if (value.length === 0) return placeholder || 'Selecione';
    const selectedLabels = value.map((v) => options.find((o) => o.value === v)?.label).filter(Boolean);
    return selectedLabels.join(', ');
  };

  return (
    <div className="flex flex-col gap-1 flex-1 grow" ref={containerRef}>
      {label && (
        <label className="relative w-fit mt-[-1.00px] font-lexend font-semibold text-[#374151] text-[16px] leading-[150%] whitespace-nowrap">
          {label}
        </label>
      )}
      <div className="relative">
        <div
          onClick={() => setIsOpen(!isOpen)}
          className="flex flex-col items-start gap-2.5 px-4 py-3 relative w-full rounded-[10px] border-[1.5px] border-solid border-[#4B5563] focus-within:border-primary transition-colors bg-white cursor-pointer"
        >
          <div className="flex justify-between w-full items-center relative">
            <span className={`font-lexend font-medium text-[14px] leading-[150%] ${value.length === 0 ? 'text-[#9CA3AF]' : 'text-[#374151]'}`}>
              {getDisplayText()}
            </span>
            <img
              className={`w-3 h-[7px] pointer-events-none transition-transform ${isOpen ? 'rotate-180' : ''}`}
              alt="Vector"
              src="https://c.animaapp.com/Bbli6X7n/img/vector-9.svg"
            />
          </div>
        </div>

        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-white border-[1.5px] border-solid border-[#4B5563] rounded-[10px] shadow-lg max-h-60 overflow-y-auto">
            {options.map((option) => (
              <div
                key={option.value}
                onClick={() => toggleOption(option.value)}
                className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${value.includes(option.value) ? 'bg-primary border-primary' : 'border-[#4B5563]'}`}>
                  {value.includes(option.value) && (
                    <svg width="12" height="9" viewBox="0 0 12 9" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M1 4.5L4.5 8L11 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <span className="font-lexend font-medium text-[#374151] text-[14px]">{option.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {error && <span className="text-red-500 text-xs">{error}</span>}
    </div>
  );
}
