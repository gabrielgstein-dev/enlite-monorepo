import type { StepStatus } from '../../../../types/workerProgress';

interface BadgeProps {
  status: StepStatus;
  size?: 'sm' | 'md';
  className?: string;
}

const statusConfig: Record<StepStatus, { icon: string; color: string; bgColor: string }> = {
  completed: {
    icon: '✅',
    color: 'text-green-700',
    bgColor: 'bg-green-50',
  },
  pending: {
    icon: '⚠️',
    color: 'text-amber-700',
    bgColor: 'bg-amber-50',
  },
  locked: {
    icon: '🔒',
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
  },
};

const sizeClasses = {
  sm: 'text-sm px-2 py-0.5',
  md: 'text-base px-3 py-1',
};

export const Badge = ({ status, size = 'sm', className = '' }: BadgeProps): JSX.Element => {
  const config = statusConfig[status];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-lexend font-medium ${config.color} ${config.bgColor} ${sizeClasses[size]} ${className}`}
    >
      <span>{config.icon}</span>
    </span>
  );
};
