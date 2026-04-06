import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { Button } from '@presentation/components/atoms/Button';
import type { MissingFields } from '@presentation/hooks/usePostularseAction';

interface IncompleteRegistrationModalProps {
  missingFields: MissingFields | null;
  onClose: () => void;
}

export function IncompleteRegistrationModal({
  missingFields,
  onClose,
}: IncompleteRegistrationModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const missingRegistration = missingFields
    ? Object.entries(missingFields.registration)
        .filter(([, done]) => !done)
        .map(([key]) => t(`publicVacancy.incompleteModal.fields.${key}`))
    : [];

  const missingDocs = missingFields
    ? Object.entries(missingFields.documents)
        .filter(([, done]) => !done)
        .map(([key]) => t(`publicVacancy.incompleteModal.fields.${key}`))
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-md w-full m-4 p-6 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-poppins font-semibold text-xl leading-tight text-primary mb-2">
          {t('publicVacancy.incompleteModal.title')}
        </p>
        <p className="font-lexend font-medium text-sm leading-[1.4] text-[#737373] mb-4">
          {t('publicVacancy.incompleteModal.body')}
        </p>

        {missingRegistration.length > 0 && (
          <div className="mb-3">
            <p className="font-lexend font-semibold text-sm text-primary mb-1.5">
              {t('publicVacancy.incompleteModal.registrationTitle')}
            </p>
            <div className="flex flex-col gap-1">
              {missingRegistration.map((label) => (
                <div key={label} className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  <span className="font-lexend text-sm text-red-600 font-medium">{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {missingDocs.length > 0 && (
          <div className="mb-3">
            <p className="font-lexend font-semibold text-sm text-primary mb-1.5">
              {t('publicVacancy.incompleteModal.documentsTitle')}
            </p>
            <div className="flex flex-col gap-1">
              {missingDocs.map((label) => (
                <div key={label} className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  <span className="font-lexend text-sm text-red-600 font-medium">{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="font-lexend font-medium text-sm leading-[1.4] text-[#737373] mb-4 mt-4">
          {t('publicVacancy.incompleteModal.redirectNotice')}
        </p>

        <div className="flex justify-end gap-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t('publicVacancy.incompleteModal.cancel')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate('/worker/profile')}
          >
            {t('publicVacancy.incompleteModal.confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}
