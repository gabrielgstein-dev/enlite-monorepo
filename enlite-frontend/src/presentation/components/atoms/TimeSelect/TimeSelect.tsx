import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';

interface TimeSelectProps {
  value?: string;
  onChange?: (e: { target: { value: string } }) => void;
  step?: 15 | 30 | 60;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
}

function generateOptions(step: number): string[] {
  const intervals = (24 * 60) / step;
  return Array.from({ length: intervals }, (_, i) => {
    const totalMinutes = i * step;
    const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
    const minutes = String(totalMinutes % 60).padStart(2, '0');
    return `${hours}:${minutes}`;
  });
}

export function TimeSelect({
  value = '',
  onChange,
  step = 30,
  className = '',
  disabled = false,
  placeholder = '--:--',
}: TimeSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const options = generateOptions(step);

  const close = useCallback(() => setOpen(false), []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, close]);

  // Scroll to selected value when opening
  useEffect(() => {
    if (!open || !listRef.current || !value) return;
    const index = options.indexOf(value);
    if (index < 0) return;
    const item = listRef.current.children[index] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'center' });
  }, [open, value, options]);

  const select = (time: string) => {
    onChange?.({ target: { value: time } });
    close();
  };

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className={[
          'flex items-center gap-1 cursor-pointer select-none',
          disabled ? 'opacity-50 cursor-not-allowed' : '',
          className,
        ].join(' ')}
      >
        <span>{value || placeholder}</span>
        <ChevronDown className="w-3.5 h-3.5 shrink-0" />
      </button>

      {open && (
        <ul
          ref={listRef}
          className="absolute z-50 mt-1 w-24 max-h-52 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg py-1 scrollbar-thin"
        >
          {options.map((time) => (
            <li key={time}>
              <button
                type="button"
                onClick={() => select(time)}
                className={[
                  'w-full px-3 py-1.5 text-sm text-left transition-colors',
                  time === value
                    ? 'bg-primary text-white font-medium'
                    : 'text-gray-700 hover:bg-primary/10 hover:text-primary',
                ].join(' ')}
              >
                {time}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
