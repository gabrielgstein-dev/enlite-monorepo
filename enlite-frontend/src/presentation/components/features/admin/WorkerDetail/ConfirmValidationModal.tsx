import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react';

export interface ConfirmValidationModalProps {
  isOpen: boolean;
  isLoading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmValidationModal({
  isOpen,
  isLoading,
  onConfirm,
  onCancel,
}: ConfirmValidationModalProps) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
      data-testid="confirm-validation-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-validation-title"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-card p-6 max-w-md w-full mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-primary/10">
            <ShieldCheck size={28} className="text-primary" aria-hidden="true" />
          </div>

          <h2
            id="confirm-validation-title"
            className="font-lexend text-lg font-semibold text-primary"
          >
            {t('admin.workerDetail.validateDocTitle')}
          </h2>

          <p className="font-lexend text-sm text-gray-800 leading-relaxed">
            {t('admin.workerDetail.validateDocBody')}
          </p>
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-3 mt-6">
          <button
            type="button"
            data-testid="cancel-validation-btn"
            disabled={isLoading}
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-full border-2 border-primary text-primary text-sm font-medium hover:bg-primary/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-lexend"
          >
            {t('admin.workerDetail.cancelValidation')}
          </button>

          <button
            type="button"
            data-testid="confirm-validation-btn"
            disabled={isLoading}
            onClick={onConfirm}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-lexend"
          >
            {isLoading ? (
              <>
                <span
                  className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"
                  aria-hidden="true"
                />
                {t('common.loading')}
              </>
            ) : (
              t('admin.workerDetail.confirmValidation')
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
