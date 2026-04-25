import { useTranslation } from 'react-i18next';
import { Typography } from '@presentation/components/atoms/Typography';
import { Button } from '@presentation/components/atoms/Button';
import type { PatientDetail } from '@domain/entities/PatientDetail';

interface CoberturaMedicaCardProps {
  patient: PatientDetail;
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col">
      <Typography variant="body" weight="medium" className="text-gray-700">
        {label}
      </Typography>
      <Typography variant="body" className="text-gray-600">
        {value ?? '—'}
      </Typography>
    </div>
  );
}

export function CoberturaMedicaCard({ patient }: CoberturaMedicaCardProps) {
  const { t } = useTranslation();

  return (
    <div
      className="bg-white rounded-card border-[1.5px] border-gray-700 p-6 sm:px-8 sm:py-10 flex flex-col gap-4"
      data-testid="cobertura-medica-card"
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Typography variant="h1" weight="semibold" as="h3">
          {t('admin.patients.detail.coverageCard.title')}
        </Typography>
        <Button variant="primary" size="sm" disabled onClick={() => {}}>
          {t('admin.patients.detail.edit')}
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
        <Field
          label={t('admin.patients.detail.coverageCard.providerName')}
          value={patient.insuranceInformed}
        />
        <Field
          label={t('admin.patients.detail.coverageCard.plan')}
          value={patient.insuranceVerified}
        />
        {/* TODO: emergencyNumbers — coluna não existe no schema atual */}
        <Field
          label={t('admin.patients.detail.coverageCard.emergencyNumbers')}
          value={null}
        />
        <Field
          label={t('admin.patients.detail.coverageCard.credential')}
          value={patient.affiliateId}
        />
      </div>
    </div>
  );
}
