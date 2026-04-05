import { useTranslation } from 'react-i18next';
import { Typography } from '@presentation/components/atoms/Typography';
import { Button } from '@presentation/components/atoms/Button';
import { getSexLabel, getGenderLabel, getLanguageLabel } from './workerDetailLabels';

interface WorkerPersonalInfoCardProps {
  birthDate: string | null;
  sex: string | null;
  gender: string | null;
  sexualOrientation: string | null;
  race: string | null;
  religion: string | null;
  languages: string[];
  weightKg: string | null;
  heightCm: string | null;
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <p className="font-lexend text-sm leading-snug">
      <span className="text-gray-800 font-medium">{label} </span>
      <span className="text-gray-700">{value ?? '—'}</span>
    </p>
  );
}

export function WorkerPersonalInfoCard({
  birthDate,
  sex,
  gender,
  sexualOrientation,
  race,
  religion,
  languages,
  weightKg,
  heightCm,
}: WorkerPersonalInfoCardProps) {
  const { t } = useTranslation();

  const formattedBirth = birthDate
    ? new Date(birthDate).toLocaleDateString('pt-BR')
    : null;

  return (
    <div className="bg-white rounded-card border-[1.5px] border-gray-700 p-6 sm:px-8 sm:py-10 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Typography variant="h1" weight="semibold" as="h3">
          {t('admin.workerDetail.personalInfo')}
        </Typography>
        <Button variant="primary" size="sm" className="w-40 shrink-0">
          {t('admin.workerDetail.edit')}
        </Button>
      </div>

      <div className="flex flex-col gap-2.5">
        <Field label={`${t('admin.workerDetail.birthDate')}:`} value={formattedBirth} />
        <Field label={`${t('admin.workerDetail.sex')}:`} value={getSexLabel(t, sex)} />
        <Field label={`${t('admin.workerDetail.gender')}:`} value={getGenderLabel(t, gender)} />
        <Field label={`${t('admin.workerDetail.sexualOrientation')}:`} value={sexualOrientation} />
        <Field label={`${t('admin.workerDetail.race')}:`} value={race} />
        <Field label={`${t('admin.workerDetail.religion')}:`} value={religion} />
        <Field label={`${t('admin.workerDetail.languages')}:`} value={languages.length > 0 ? languages.map(l => getLanguageLabel(t, l)).join(', ') : null} />
        <Field label={`${t('admin.workerDetail.weight')}:`} value={weightKg ? `${weightKg}kg` : null} />
        <Field label={`${t('admin.workerDetail.height')}:`} value={heightCm ? `${heightCm}m` : null} />
      </div>
    </div>
  );
}
