import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Typography } from '@presentation/components/atoms/Typography';

export interface CreatePatientAddressDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: {
    addressFormatted: string;
    addressRaw?: string;
    addressType: string;
  }) => Promise<void>;
  isSubmitting: boolean;
}

export function CreatePatientAddressDialog({
  isOpen,
  onClose,
  onConfirm,
  isSubmitting,
}: CreatePatientAddressDialogProps) {
  const { t } = useTranslation();
  const p = (k: string) => t(`admin.createVacancy.createAddressDialog.${k}`);

  const [addressFormatted, setAddressFormatted] = useState('');
  const [addressRaw, setAddressRaw] = useState('');
  const [addressType, setAddressType] = useState('primary');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addressFormatted.trim()) {
      setError(p('addressFormattedRequired'));
      return;
    }
    setError(null);
    try {
      await onConfirm({
        addressFormatted: addressFormatted.trim(),
        addressRaw: addressRaw.trim() || undefined,
        addressType,
      });
      setAddressFormatted('');
      setAddressRaw('');
      setAddressType('primary');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleClose = () => {
    if (isSubmitting) return;
    setAddressFormatted('');
    setAddressRaw('');
    setAddressType('primary');
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 flex flex-col gap-5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-address-dialog-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3
            id="create-address-dialog-title"
            className="text-lg font-semibold text-slate-800"
          >
            {p('title')}
          </h3>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            aria-label={p('cancel')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Address formatted */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700">
              {p('addressFormatted')}
              <span className="text-red-500 ml-1">*</span>
            </label>
            <input
              type="text"
              value={addressFormatted}
              onChange={e => setAddressFormatted(e.target.value)}
              disabled={isSubmitting}
              placeholder="Av. Corrientes 1234, CABA"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
          </div>

          {/* Address raw (optional) */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700">
              {p('addressRaw')}
              <span className="text-slate-400 text-xs ml-1">({t('common.optional', 'opcional')})</span>
            </label>
            <input
              type="text"
              value={addressRaw}
              onChange={e => setAddressRaw(e.target.value)}
              disabled={isSubmitting}
              placeholder="Corrientes 1234 piso 2"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
          </div>

          {/* Address type */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700">{p('addressType')}</label>
            <select
              value={addressType}
              onChange={e => setAddressType(e.target.value)}
              disabled={isSubmitting}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50 bg-white"
            >
              <option value="primary">{p('addressTypePrimary')}</option>
              <option value="secondary">{p('addressTypeSecondary')}</option>
              <option value="service">{p('addressTypeService')}</option>
            </select>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <Typography variant="body" className="text-red-600 text-sm">{error}</Typography>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              {p('cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !addressFormatted.trim()}
              className="px-5 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {t('common.saving', 'Guardando...')}
                </>
              ) : p('save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
