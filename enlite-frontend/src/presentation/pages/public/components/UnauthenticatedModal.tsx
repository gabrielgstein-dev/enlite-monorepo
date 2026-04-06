import { useTranslation } from 'react-i18next';
import { Button } from '@presentation/components/atoms/Button';
import { Typography } from '@presentation/components/atoms/Typography';

interface UnauthenticatedModalProps {
  onClose: () => void;
  onConfirm: () => void;
}

export function UnauthenticatedModal({ onClose, onConfirm }: UnauthenticatedModalProps) {
  const { t } = useTranslation();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-md w-full m-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <Typography variant="h2" weight="semibold" color="primary" className="mb-4">
          {t('publicVacancy.modal.title')}
        </Typography>
        <p className="font-lexend text-sm text-gray-500 mb-6">
          {t('publicVacancy.modal.body')}
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t('publicVacancy.modal.cancel')}
          </Button>
          <Button variant="primary" size="sm" onClick={onConfirm}>
            {t('publicVacancy.modal.confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}
