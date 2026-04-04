import { SelectHTMLAttributes } from 'react';

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const hours = String(Math.floor(i / 2)).padStart(2, '0');
  const minutes = i % 2 === 0 ? '00' : '30';
  return `${hours}:${minutes}`;
});

type TimeSelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> & {
  step?: 15 | 30 | 60;
};

function generateOptions(step: number): string[] {
  if (step === 30) return TIME_OPTIONS;
  const intervals = (24 * 60) / step;
  return Array.from({ length: intervals }, (_, i) => {
    const totalMinutes = i * step;
    const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
    const minutes = String(totalMinutes % 60).padStart(2, '0');
    return `${hours}:${minutes}`;
  });
}

export function TimeSelect({ step = 30, className, ...props }: TimeSelectProps) {
  const options = generateOptions(step);

  return (
    <select className={className} {...props}>
      {options.map((time) => (
        <option key={time} value={time}>{time}</option>
      ))}
    </select>
  );
}
