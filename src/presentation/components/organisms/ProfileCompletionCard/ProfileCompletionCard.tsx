import { useTranslation } from 'react-i18next';
import { ProgressBar, PercentageDisplay, Typography } from '@presentation/components/atoms';
import { ProgressSection } from '@presentation/components/molecules/ProgressSection';
import type { WorkerProfileProgress } from '../../../../types/workerProgress';

interface ProfileCompletionCardProps {
  progress: WorkerProfileProgress;
  onActionClick?: () => void;
  className?: string;
}

export const ProfileCompletionCard = ({
  progress,
  onActionClick,
  className = '',
}: ProfileCompletionCardProps): JSX.Element => {
  const { t } = useTranslation();
  
  return (
    <div
      className={`w-full bg-white border-2 border-purple-100 rounded-2xl p-6 shadow-sm ${className}`}
    >
      <div className="flex items-center justify-between mb-4">
        <Typography variant="h2" color="primary">
          🎯 {t('profile.completionCard.title')}
        </Typography>
        <PercentageDisplay percentage={progress.overallPercentage} size="lg" />
      </div>

      <ProgressBar
        percentage={progress.overallPercentage}
        height="lg"
        animated
        className="mb-6"
      />

      <div className="flex flex-col gap-4 mb-6">
        {progress.sections.map((section) => (
          <ProgressSection key={section.id} section={section} />
        ))}
      </div>

      {progress.nextAction && (
        <button
          onClick={onActionClick}
          className="w-full px-6 py-3 bg-primary text-white rounded-full font-poppins font-semibold hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
        >
          {progress.nextAction.label}
          <span>→</span>
        </button>
      )}
    </div>
  );
};
