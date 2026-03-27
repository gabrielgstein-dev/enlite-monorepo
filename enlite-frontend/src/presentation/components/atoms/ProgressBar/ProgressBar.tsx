interface ProgressBarProps {
  percentage: number;
  height?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  animated?: boolean;
  className?: string;
}

const heightClasses = {
  sm: 'h-2',
  md: 'h-3',
  lg: 'h-4',
};

export const ProgressBar = ({
  percentage,
  height = 'md',
  showLabel = false,
  animated = true,
  className = '',
}: ProgressBarProps): JSX.Element => {
  const clampedPercentage = Math.min(100, Math.max(0, percentage));

  return (
    <div className={`w-full ${className}`}>
      <div className={`w-full bg-gray-200 rounded-full overflow-hidden ${heightClasses[height]}`}>
        <div
          className={`h-full bg-gradient-to-r from-primary to-purple-600 rounded-full ${
            animated ? 'transition-all duration-500 ease-out' : ''
          }`}
          style={{ width: `${clampedPercentage}%` }}
        />
      </div>
      {showLabel && (
        <p className="font-lexend text-sm text-gray-800 mt-1">
          {clampedPercentage}% concluído
        </p>
      )}
    </div>
  );
};
