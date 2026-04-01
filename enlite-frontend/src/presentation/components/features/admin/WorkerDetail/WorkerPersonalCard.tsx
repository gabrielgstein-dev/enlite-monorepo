import { useTranslation } from 'react-i18next';
import { Typography } from '@presentation/components/atoms/Typography';

interface WorkerPersonalCardProps {
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone: string | null;
  whatsappPhone: string | null;
  profilePhotoUrl: string | null;
  birthDate: string | null;
  documentType: string | null;
  documentNumber: string | null;
  sex: string | null;
  gender: string | null;
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between">
      <Typography variant="body" className="text-[#737373]">{label}</Typography>
      <Typography variant="body" weight="medium">{value ?? '—'}</Typography>
    </div>
  );
}

export function WorkerPersonalCard({
  firstName,
  lastName,
  email,
  phone,
  whatsappPhone,
  profilePhotoUrl,
  birthDate,
  documentType,
  documentNumber,
  sex,
  gender,
}: WorkerPersonalCardProps) {
  const { t } = useTranslation();
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || '—';
  const formattedBirth = birthDate
    ? new Date(birthDate).toLocaleDateString('pt-BR')
    : null;
  const docDisplay = documentNumber
    ? `${documentType ?? '—'}: ${documentNumber}`
    : null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4">
      <Typography variant="h3" weight="semibold" className="text-[#737373]">
        {t('admin.workerDetail.personalData')}
      </Typography>
      <div className="flex items-center gap-4 mb-2">
        {profilePhotoUrl ? (
          <img
            src={profilePhotoUrl}
            alt={fullName}
            className="w-14 h-14 rounded-full object-cover border border-slate-200"
          />
        ) : (
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 text-xl font-semibold">
            {(firstName?.[0] ?? email[0] ?? '?').toUpperCase()}
          </div>
        )}
        <div>
          <Typography variant="body" weight="semibold">{fullName}</Typography>
          <Typography variant="body" className="text-[#737373] text-sm">{email}</Typography>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <Field label={t('admin.workerDetail.phone')} value={phone} />
        <Field label={t('admin.workerDetail.whatsapp')} value={whatsappPhone} />
        <Field label={t('admin.workerDetail.birthDate')} value={formattedBirth} />
        <Field label={t('admin.workerDetail.document')} value={docDisplay} />
        <Field label={t('admin.workerDetail.sex')} value={sex} />
        <Field label={t('admin.workerDetail.gender')} value={gender} />
      </div>
    </div>
  );
}
