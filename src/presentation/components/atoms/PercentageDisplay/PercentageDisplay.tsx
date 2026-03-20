interface PercentageDisplayProps {
  percentage: number;
  size?: 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeClasses = {
  md: 'text-2xl',
  lg: 'text-3xl',
  xl: 'text-4xl',
};

export const PercentageDisplay = ({
  percentage,
  size = 'lg',
  className = '',
}: PercentageDisplayProps): JSX.Element => {
  const clampedPercentage = Math.min(100, Math.max(0, percentage));

  return (
    <span
      className={`font-poppins font-bold text-primary ${sizeClasses[size]} ${className}`}
    >
      {clampedPercentage}%
    </span>
  );
};
