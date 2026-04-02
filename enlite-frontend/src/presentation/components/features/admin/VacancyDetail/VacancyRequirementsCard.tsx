import { useTranslation } from 'react-i18next';
import { Typography } from '@presentation/components/atoms/Typography';

interface VacancyRequirementsCardProps {
  llmRequiredSex: string | null;
  llmRequiredProfession: string[] | null;
  llmRequiredSpecialties: string[] | null;
  llmRequiredDiagnoses: string[] | null;
  llmEnrichedAt: string | null;
}

function LlmBadge({ enrichedAt }: { enrichedAt: string | null }) {
  const { t } = useTranslation();
  if (!enrichedAt) return null;
  const date = new Date(enrichedAt).toLocaleDateString('es-AR');
  return (
    <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full whitespace-nowrap">
      {t('admin.vacancyDetail.requirementsCard.llmBadge', { date })}
    </span>
  );
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
  llmRequiredSex,
  llmRequiredProfession,
  llmRequiredSpecialties,
  llmRequiredDiagnoses,
  llmEnrichedAt,
}: VacancyRequirementsCardProps) {
  const { t } = useTranslation();

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Typography variant="h3" weight="semibold" className="text-[#737373]">
          {t('admin.vacancyDetail.requirementsCard.title')}
        </Typography>
        <LlmBadge enrichedAt={llmEnrichedAt} />
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex justify-between items-center">
          <Typography variant="body" className="text-[#737373]">{t('admin.vacancyDetail.requirementsCard.requiredSex')}</Typography>
          <Typography variant="body" weight="medium">{llmRequiredSex ?? '—'}</Typography>
        </div>
        <div className="flex justify-between items-start">
          <Typography variant="body" className="text-[#737373]">{t('admin.vacancyDetail.requirementsCard.professions')}</Typography>
          <ChipList items={llmRequiredProfession ?? []} />
        </div>
        <div className="flex justify-between items-start">
          <Typography variant="body" className="text-[#737373]">{t('admin.vacancyDetail.requirementsCard.specialties')}</Typography>
          <ChipList items={llmRequiredSpecialties ?? []} />
        </div>
        <div className="flex justify-between items-start">
          <Typography variant="body" className="text-[#737373]">{t('admin.vacancyDetail.requirementsCard.requiredDiagnoses')}</Typography>
          <ChipList items={llmRequiredDiagnoses ?? []} />
        </div>
      </div>
    </div>
  );
}
