import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, CheckCircle, MapPin, PlusCircle } from 'lucide-react';
import { Typography } from '@presentation/components/atoms/Typography';
import type { AddressMatchCandidate } from '@domain/entities/PatientAddress';
import { CreatePatientAddressDialog } from './CreatePatientAddressDialog';

export interface PatientAddressSelectorProps {
  patientId: string | null;
  addressMatches: AddressMatchCandidate[];
  selectedAddressId: string | null;
  onSelect: (id: string) => void;
  onCreateNew: (data: {
    addressFormatted: string;
    addressRaw?: string;
    addressType: string;
  }) => Promise<string>;
  onNext: () => void;
  onBack: () => void;
  isCreating: boolean;
}

export function PatientAddressSelector({
  patientId,
  addressMatches,
  selectedAddressId,
  onSelect,
  onCreateNew,
  onNext,
  onBack,
  isCreating,
}: PatientAddressSelectorProps) {
  const { t } = useTranslation();
  const s = (k: string) => t(`admin.createVacancy.addressStep.${k}`);

  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Auto-open dialog when there are no matches but we have a patientId
  useEffect(() => {
    if (addressMatches.length === 0 && patientId !== null) {
      setIsDialogOpen(true);
    }
  }, [addressMatches.length, patientId]);

  const handleDialogConfirm = async (data: {
    addressFormatted: string;
    addressRaw?: string;
    addressType: string;
  }) => {
    await onCreateNew(data);
    setIsDialogOpen(false);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <MapPin className="w-5 h-5 text-primary" />
        <Typography variant="h3" weight="semibold" className="text-slate-800">
          {s('title')}
        </Typography>
      </div>

      <Typography variant="body" className="text-slate-500 text-sm">
        {s('subtitle')}
      </Typography>

      {/* No patient warning */}
      {patientId === null && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <Typography variant="body" className="text-amber-700 text-sm">
            {s('noPatient')}
          </Typography>
        </div>
      )}

      {/* No matches message */}
      {addressMatches.length === 0 && patientId !== null && (
        <div className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
          <AlertCircle className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
          <Typography variant="body" className="text-slate-600 text-sm">
            {s('noAddresses')}
          </Typography>
        </div>
      )}

      {/* Address cards */}
      {addressMatches.length > 0 && (
        <div className="flex flex-col gap-3">
          {addressMatches.map((candidate) => {
            const isSelected = selectedAddressId === candidate.patient_address_id;
            const isExact = candidate.matchType === 'EXACT';
            return (
              <button
                key={candidate.patient_address_id}
                type="button"
                onClick={() => onSelect(candidate.patient_address_id)}
                className={[
                  'w-full text-left rounded-lg border-2 px-4 py-3 flex items-start gap-3 transition-colors',
                  isSelected
                    ? 'border-primary bg-primary/5'
                    : 'border-slate-200 bg-white hover:border-slate-300',
                ].join(' ')}
              >
                {isSelected
                  ? <CheckCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  : <MapPin className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                }
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-800 truncate">
                      {candidate.addressFormatted}
                    </span>
                    <span className={[
                      'shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold',
                      isExact
                        ? 'bg-green-100 text-green-700'
                        : 'bg-amber-100 text-amber-700',
                    ].join(' ')}>
                      {isExact ? s('badgeExact') : s('badgeFuzzy')}
                    </span>
                  </div>
                  {candidate.addressRaw && (
                    <span className="text-xs text-slate-400 truncate">{candidate.addressRaw}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Create new address button */}
      {patientId !== null && (
        <button
          type="button"
          onClick={() => setIsDialogOpen(true)}
          disabled={isCreating}
          className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors self-start disabled:opacity-50"
        >
          <PlusCircle className="w-4 h-4" />
          {s('createNew')}
        </button>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
        >
          {s('back')}
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={selectedAddressId === null}
          className="px-6 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {s('continue')}
        </button>
      </div>

      {/* Create address dialog */}
      <CreatePatientAddressDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onConfirm={handleDialogConfirm}
        isSubmitting={isCreating}
      />
    </div>
  );
}
