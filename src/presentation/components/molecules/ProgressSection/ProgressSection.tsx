import { ProgressStepItem } from '../ProgressStepItem';
import { ProgressBar, Typography } from '@presentation/components/atoms';
import type { ProgressSection as ProgressSectionType } from '../../../../types/workerProgress';

interface ProgressSectionProps {
  section: ProgressSectionType;
  className?: string;
}

export const ProgressSection = ({
  section,
  className = '',
}: ProgressSectionProps): JSX.Element => {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{section.icon}</span>
        <Typography variant="h3" color="primary">
          {section.title}
        </Typography>
        <Typography variant="caption" color="tertiary">
          ({section.completedCount}/{section.totalCount})
        </Typography>
        {section.percentage === 100 ? (
          <span className="text-xs font-semibold text-green-600">100%</span>
        ) : (
          <span className="text-xs text-gray-400">{section.percentage}%</span>
        )}
      </div>
      <ProgressBar
        percentage={section.percentage}
        height="sm"
        animated
        className="mb-1"
      />
      <div className="flex flex-col">
        {section.steps.map((step) => (
          <ProgressStepItem
            key={step.id}
            label={step.label}
            status={step.status}
            indent
          />
        ))}
      </div>
    </div>
  );
};
