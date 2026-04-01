import { useTranslation } from 'react-i18next';
import { Typography } from '@presentation/components/atoms/Typography';
import { ExternalLink } from 'lucide-react';

interface WorkerProfessionalCardProps {
  profession: string | null;
  occupation: string | null;
  knowledgeLevel: string | null;
  titleCertificate: string | null;
  experienceTypes: string[];
  yearsExperience: string | null;
  preferredTypes: string[];
  preferredAgeRange: string | null;
  languages: string[];
  linkedinUrl: string | null;
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between">
      <Typography variant="body" className="text-[#737373]">{label}</Typography>
      <Typography variant="body" weight="medium">{value ?? '—'}</Typography>
    </div>
  );
}

function ArrayField({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="flex justify-between items-start">
      <Typography variant="body" className="text-[#737373] shrink-0">{label}</Typography>
      <div className="flex flex-wrap justify-end gap-1 ml-4">
        {values.length > 0 ? (
          values.map((v) => (
            <span key={v} className="px-2 py-0.5 rounded-full bg-slate-100 text-xs text-slate-600">
              {v}
            </span>
          ))
        ) : (
          <Typography variant="body" weight="medium">—</Typography>
        )}
      </div>
    </div>
  );
}

export function WorkerProfessionalCard({
  profession,
  occupation,
  knowledgeLevel,
  titleCertificate,
  experienceTypes,
  yearsExperience,
  preferredTypes,
  preferredAgeRange,
  languages,
  linkedinUrl,
}: WorkerProfessionalCardProps) {
  const { t } = useTranslation();

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4">
      <Typography variant="h3" weight="semibold" className="text-[#737373]">
        {t('admin.workerDetail.professionalData')}
      </Typography>
      <div className="flex flex-col gap-3">
        <Field label={t('admin.workerDetail.profession')} value={profession} />
        <Field label={t('admin.workerDetail.occupation')} value={occupation} />
        <Field label={t('admin.workerDetail.knowledgeLevel')} value={knowledgeLevel} />
        <Field label={t('admin.workerDetail.titleCertificate')} value={titleCertificate} />
        <Field label={t('admin.workerDetail.yearsExperience')} value={yearsExperience} />
        <Field label={t('admin.workerDetail.preferredAgeRange')} value={preferredAgeRange} />
        <ArrayField label={t('admin.workerDetail.experienceTypes')} values={experienceTypes} />
        <ArrayField label={t('admin.workerDetail.preferredTypes')} values={preferredTypes} />
        <ArrayField label={t('admin.workerDetail.languages')} values={languages} />
        {linkedinUrl && (
          <div className="flex justify-between items-center">
            <Typography variant="body" className="text-[#737373]">LinkedIn</Typography>
            <a
              href={linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-blue-600 hover:underline text-sm"
            >
              {t('admin.workerDetail.viewProfile')} <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
