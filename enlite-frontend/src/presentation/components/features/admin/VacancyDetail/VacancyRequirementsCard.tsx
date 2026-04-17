import { useTranslation } from 'react-i18next';
import { Typography } from '@presentation/components/atoms/Typography';

interface VacancyRequirementsCardProps {
  requiredSex: string | null;
  requiredProfessions: string[] | null;
  pathologyTypes: string | null;
}

function ChipList({ items }: { items: string[] }) {
  if (!items.length) return <Typography variant="body" className="text-[#737373]">—</Typography>;
  return (
    <div className="flex flex-wrap gap-1 justify-end max-w-[60%]">
      {items.map((item, i) => (
        <span key={i} className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full">
          {item}
        </span>
      ))}
    </div>
  );
}

export function VacancyRequirementsCard({
  requiredSex,
  requiredProfessions,
  pathologyTypes,
}: VacancyRequirementsCardProps) {
  const { t } = useTranslation();

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4">
      <Typography variant="h3" weight="semibold" className="text-[#737373]">
        {t('admin.vacancyDetail.requirementsCard.title')}
      </Typography>
      <div className="flex flex-col gap-3">
        <div className="flex justify-between items-center">
          <Typography variant="body" className="text-[#737373]">{t('admin.vacancyDetail.requirementsCard.requiredSex')}</Typography>
          <Typography variant="body" weight="medium">{requiredSex ?? '—'}</Typography>
        </div>
        <div className="flex justify-between items-start">
          <Typography variant="body" className="text-[#737373]">{t('admin.vacancyDetail.requirementsCard.professions')}</Typography>
          <ChipList items={requiredProfessions ?? []} />
        </div>
        <div className="flex justify-between items-start">
          <Typography variant="body" className="text-[#737373]">{t('admin.vacancyDetail.requirementsCard.pathologies')}</Typography>
          <Typography variant="body" weight="medium" className="text-right max-w-[60%]">
            {pathologyTypes ?? '—'}
          </Typography>
        </div>
      </div>
    </div>
  );
}
