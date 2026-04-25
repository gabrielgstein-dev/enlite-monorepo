import { useTranslation } from 'react-i18next';
import { Typography } from '@presentation/components/atoms/Typography';
import { Button } from '@presentation/components/atoms/Button';
import type { PatientDetail } from '@domain/entities/PatientDetail';

interface DiagnosticoCardProps {
  patient: PatientDetail;
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <p className="font-lexend text-sm leading-snug">
      <span className="text-gray-800 font-medium">{label} </span>
      <span className="text-gray-700">{value ?? '—'}</span>
    </p>
  );
}

function BoolField({ label, value }: { label: string; value: boolean | null }) {
  const { t } = useTranslation();
  const display = value === null ? null : value ? t('common.yes', 'Sim') : t('common.no', 'Não');
  return <Field label={label} value={display} />;
}

export function DiagnosticoCard({ patient }: DiagnosticoCardProps) {
  const { t } = useTranslation();

  const specialtyLabel = patient.clinicalSpecialty
    ? t(`admin.patients.specialtyOptions.${patient.clinicalSpecialty}`, patient.clinicalSpecialty)
    : null;

  return (
    <div className="bg-white rounded-card border-[1.5px] border-gray-700 p-6 sm:px-8 sm:py-10 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Typography variant="h1" weight="semibold" as="h3">
          {t('admin.patients.detail.diagnosisCard.title')}
        </Typography>
        <Button variant="outline" size="sm" disabled onClick={() => {}} className="w-28">
          {t('admin.patients.detail.edit')}
        </Button>
      </div>

      <div className="flex flex-col gap-2.5">
        <Field
          label={`${t('admin.patients.detail.diagnosisCard.cid')}:`}
          value={patient.diagnosis}
        />
        <Field
          label={`${t('admin.patients.detail.diagnosisCard.details')}:`}
          value={patient.additionalComments}
        />
        <Field
          label={`${t('admin.patients.detail.diagnosisCard.pathologyTypes')}:`}
          value={specialtyLabel}
        />
        {/* Fields without backend columns — TODO: add when columns available */}
        <BoolField
          label={`${t('admin.patients.detail.diagnosisCard.hasFollowUp')}:`}
          value={null}
        />
        <BoolField
          label={`${t('admin.patients.detail.diagnosisCard.receivesMoney')}:`}
          value={null}
        />
        <BoolField
          label={`${t('admin.patients.detail.diagnosisCard.aggressiveBehavior')}:`}
          value={null}
        />
        <BoolField
          label={`${t('admin.patients.detail.diagnosisCard.suicidalIdeation')}:`}
          value={null}
        />
        <Field
          label={`${t('admin.patients.detail.diagnosisCard.patientReport')}:`}
          value={null}
        />
        <BoolField
          label={`${t('admin.patients.detail.diagnosisCard.protectionCertificate')}:`}
          value={patient.hasJudicialProtection}
        />
        <BoolField
          label={`${t('admin.patients.detail.diagnosisCard.disabilityCertificate')}:`}
          value={patient.hasCud}
        />
        <Field
          label={`${t('admin.patients.detail.diagnosisCard.comments')}:`}
          value={null}
        />
      </div>
    </div>
  );
}
