import { useTranslation } from 'react-i18next';
import { Typography } from '@presentation/components/atoms/Typography';

interface VacancyPatientCardProps {
  firstName: string | null;
  lastName: string | null;
  diagnosis: string | null;
  zone: string | null;
  insuranceVerified: boolean | null;
}

export function VacancyPatientCard({
  firstName,
  lastName,
  diagnosis,
  zone,
  insuranceVerified,
}: VacancyPatientCardProps) {
  const { t } = useTranslation();
  const patientName = [firstName, lastName].filter(Boolean).join(' ') || '—';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4">
      <Typography variant="h3" weight="semibold" className="text-[#737373]">
        {t('admin.vacancyDetail.patientCard.title')}
      </Typography>
      <div className="flex flex-col gap-3">
        <div className="flex justify-between">
          <Typography variant="body" className="text-[#737373]">{t('admin.vacancyDetail.patientCard.name')}</Typography>
          <Typography variant="body" weight="medium">{patientName}</Typography>
        </div>
        <div className="flex justify-between">
          <Typography variant="body" className="text-[#737373]">{t('admin.vacancyDetail.patientCard.diagnosis')}</Typography>
          <Typography variant="body" weight="medium">{diagnosis ?? '—'}</Typography>
        </div>
        <div className="flex justify-between">
          <Typography variant="body" className="text-[#737373]">{t('admin.vacancyDetail.patientCard.zone')}</Typography>
          <Typography variant="body" weight="medium">{zone ?? '—'}</Typography>
        </div>
        <div className="flex justify-between">
          <Typography variant="body" className="text-[#737373]">{t('admin.vacancyDetail.patientCard.insuranceVerified')}</Typography>
          <Typography variant="body" weight="medium">
            {insuranceVerified === null ? '—' : insuranceVerified ? t('admin.vacancyDetail.patientCard.yes') : t('admin.vacancyDetail.patientCard.no')}
          </Typography>
        </div>
      </div>
    </div>
  );
}
