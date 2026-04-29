import { useTranslation } from 'react-i18next';
import { CheckCircle, GitMerge } from 'lucide-react';
import { Typography } from '@presentation/components/atoms/Typography';
import type { PatientFieldClash } from '@domain/entities/PatientAddress';
import type { ClashResolution } from '@hooks/admin/useCreateVacancyFlow';

export interface PatientFieldClashResolverProps {
  clashes: PatientFieldClash[];
  resolvedClashes: Record<string, ClashResolution>;
  onResolve: (field: string, resolution: ClashResolution) => void;
  onNext: () => void;
  onBack: () => void;
}

const FIELD_LABELS: Record<string, string> = {
  pathology_types: 'admin.createVacancy.clashStep.fields.pathology_types',
  dependency_level: 'admin.createVacancy.clashStep.fields.dependency_level',
};

export function PatientFieldClashResolver({
  clashes,
  resolvedClashes,
  onResolve,
  onNext,
  onBack,
}: PatientFieldClashResolverProps) {
  const { t } = useTranslation();
  const c = (k: string) => t(`admin.createVacancy.clashStep.${k}`);

  const activeClashes = clashes.filter(cl => cl.action === 'CLASH');
  const allResolved = activeClashes.length === 0
    || activeClashes.every(cl => resolvedClashes[cl.field] !== undefined);

  const getFieldLabel = (field: string): string => {
    const key = FIELD_LABELS[field];
    return key ? t(key) : field;
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <GitMerge className="w-5 h-5 text-primary" />
        <Typography variant="h3" weight="semibold" className="text-slate-800">
          {c('title')}
        </Typography>
      </div>

      <Typography variant="body" className="text-slate-500 text-sm">
        {c('subtitle')}
      </Typography>

      {/* No clashes */}
      {activeClashes.length === 0 && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
          <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
          <Typography variant="body" className="text-green-700 text-sm">
            {c('noClashes')}
          </Typography>
        </div>
      )}

      {/* Clash cards */}
      {activeClashes.length > 0 && (
        <div className="flex flex-col gap-4">
          {activeClashes.map((clash) => {
            const resolved = resolvedClashes[clash.field];
            return (
              <div
                key={clash.field}
                className="border border-slate-200 rounded-lg overflow-hidden"
              >
                {/* Field label */}
                <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
                  <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    {getFieldLabel(clash.field)}
                  </span>
                </div>

                {/* Two columns: PDF vs Patient */}
                <div className="grid grid-cols-2 divide-x divide-slate-200">
                  {/* PDF value */}
                  <button
                    type="button"
                    onClick={() => onResolve(clash.field, 'use_pdf')}
                    className={[
                      'flex flex-col gap-1.5 px-4 py-3 text-left transition-colors',
                      resolved === 'use_pdf'
                        ? 'bg-primary/5 ring-2 ring-inset ring-primary'
                        : 'hover:bg-slate-50',
                    ].join(' ')}
                  >
                    <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                      PDF
                    </span>
                    <span className="text-sm text-slate-800 font-medium break-words">
                      {clash.pdfValue ?? '—'}
                    </span>
                    <span className={[
                      'text-xs font-semibold mt-1 self-start',
                      resolved === 'use_pdf' ? 'text-primary' : 'text-slate-400',
                    ].join(' ')}>
                      {c('usePdf')}
                    </span>
                  </button>

                  {/* Patient value */}
                  <button
                    type="button"
                    onClick={() => onResolve(clash.field, 'keep_patient')}
                    className={[
                      'flex flex-col gap-1.5 px-4 py-3 text-left transition-colors',
                      resolved === 'keep_patient'
                        ? 'bg-primary/5 ring-2 ring-inset ring-primary'
                        : 'hover:bg-slate-50',
                    ].join(' ')}
                  >
                    <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                      {c('patientColumn')}
                    </span>
                    <span className="text-sm text-slate-800 font-medium break-words">
                      {clash.patientValue ?? '—'}
                    </span>
                    <span className={[
                      'text-xs font-semibold mt-1 self-start',
                      resolved === 'keep_patient' ? 'text-primary' : 'text-slate-400',
                    ].join(' ')}>
                      {c('keepPatient')}
                    </span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
        >
          {c('back')}
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!allResolved}
          className="px-6 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {c('continue')}
        </button>
      </div>
    </div>
  );
}
