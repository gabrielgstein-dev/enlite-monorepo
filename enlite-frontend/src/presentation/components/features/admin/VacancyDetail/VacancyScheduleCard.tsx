import { useTranslation } from 'react-i18next';
import { Typography } from '@presentation/components/atoms/Typography';

interface VacancyScheduleCardProps {
  scheduleDaysHours: string | null;
}

export function VacancyScheduleCard({ scheduleDaysHours }: VacancyScheduleCardProps) {
  const { t } = useTranslation();

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4">
      <Typography variant="h3" weight="semibold" className="text-[#737373]">
        {t('admin.vacancyDetail.scheduleCard.title')}
      </Typography>

      {scheduleDaysHours ? (
        <Typography variant="body" className="text-slate-700">{scheduleDaysHours}</Typography>
      ) : (
        <Typography variant="body" className="text-[#737373]">—</Typography>
      )}
    </div>
  );
}
