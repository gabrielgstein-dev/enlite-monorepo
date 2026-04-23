import { useTranslation } from 'react-i18next';
import { Eye } from 'lucide-react';
import { Typography } from '@presentation/components/atoms/Typography';

export interface PatientRow {
  id: string;
  firstName: string;
  lastName: string;
  documentType: string | null;
  documentNumber: string | null;
  dependencyLevel: string | null;
  clinicalSpecialty: string | null;
  serviceType: string[];
  needsAttention: boolean;
  attentionReasons: string[];
}

interface PatientsTableProps {
  patients: PatientRow[];
  onRowClick?: (id: string) => void;
}

function StatusBadge({ needsAttention, reasons }: { needsAttention: boolean; reasons: string[] }) {
  const { t } = useTranslation();

  if (!needsAttention) {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700"
        title={t('admin.patients.statusBadge.complete')}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
        {t('admin.patients.statusBadge.complete')}
      </span>
    );
  }

  const reasonLabels = reasons
    .map((r) => t(`admin.patients.reasonOptions.${r}`, r))
    .join(', ');

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 cursor-help"
      title={reasonLabels || t('admin.patients.statusBadge.needsAttention')}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
      {t('admin.patients.statusBadge.needsAttention')}
    </span>
  );
}

function formatDocument(type: string | null, number: string | null): string {
  if (!type && !number) return '—';
  if (type && number) return `${type} ${number}`;
  return number ?? type ?? '—';
}

function formatServiceType(types: string[]): string {
  if (!types || types.length === 0) return '—';
  return types.join(' + ');
}

function formatDependency(t: ReturnType<typeof useTranslation>['t'], level: string | null): string {
  if (!level) return '—';
  return t(`admin.patients.dependencyOptions.${level}`, level);
}

function formatSpecialty(t: ReturnType<typeof useTranslation>['t'], specialty: string | null): string {
  if (!specialty) return '—';
  return t(`admin.patients.specialtyOptions.${specialty}`, specialty);
}

export function PatientsTable({ patients, onRowClick }: PatientsTableProps): JSX.Element {
  const { t } = useTranslation();
  const safePatients = patients ?? [];

  return (
    <div className="w-full rounded-xl overflow-hidden border border-[#ECEFF1]">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[600px]">
          <thead>
            <tr className="h-11 bg-[#EEEEEE]">
              <th className="w-10 px-3" />
              <th className="text-left px-4 whitespace-nowrap">
                <Typography variant="body" weight="medium" className="text-[#737373] font-lexend text-base">
                  {t('admin.patients.table.name')}
                </Typography>
              </th>
              <th className="text-left px-4 whitespace-nowrap">
                <Typography variant="body" weight="medium" className="text-[#737373] font-lexend text-base">
                  {t('admin.patients.table.document')}
                </Typography>
              </th>
              <th className="text-left px-4 whitespace-nowrap hidden md:table-cell">
                <Typography variant="body" weight="medium" className="text-[#737373] font-lexend text-base">
                  {t('admin.patients.table.dependency')}
                </Typography>
              </th>
              <th className="text-left px-4 whitespace-nowrap hidden lg:table-cell">
                <Typography variant="body" weight="medium" className="text-[#737373] font-lexend text-base">
                  {t('admin.patients.table.specialty')}
                </Typography>
              </th>
              <th className="text-left px-4 whitespace-nowrap hidden md:table-cell">
                <Typography variant="body" weight="medium" className="text-[#737373] font-lexend text-base">
                  {t('admin.patients.table.service')}
                </Typography>
              </th>
              <th className="text-left px-4 whitespace-nowrap">
                <Typography variant="body" weight="medium" className="text-[#737373] font-lexend text-base">
                  {t('admin.patients.table.status')}
                </Typography>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#ECEFF1]">
            {safePatients.length === 0 ? (
              <tr>
                <td colSpan={7} className="h-[200px] bg-white text-center">
                  <Typography variant="body" className="text-[#737373]">
                    {t('admin.patients.noPatients')}
                  </Typography>
                </td>
              </tr>
            ) : (
              safePatients.map((row) => {
                const fullName = [row.lastName, row.firstName].filter(Boolean).join(', ') || '—';
                return (
                  <tr
                    key={row.id}
                    onClick={() => onRowClick?.(row.id)}
                    className={`h-[72px] bg-white ${onRowClick ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                  >
                    <td className="px-3">
                      <Eye className="w-5 h-5 text-[#737373]" aria-label={t('admin.patients.table.view')} />
                    </td>
                    <td className="px-4">
                      <Typography variant="body" weight="medium" className="text-[#737373] font-lexend text-sm">
                        {fullName}
                      </Typography>
                    </td>
                    <td className="px-4 whitespace-nowrap">
                      <Typography variant="body" weight="medium" className="text-[#737373] font-lexend text-sm">
                        {formatDocument(row.documentType, row.documentNumber)}
                      </Typography>
                    </td>
                    <td className="px-4 whitespace-nowrap hidden md:table-cell">
                      <Typography variant="body" weight="medium" className="text-[#737373] font-lexend text-sm">
                        {formatDependency(t, row.dependencyLevel)}
                      </Typography>
                    </td>
                    <td className="px-4 whitespace-nowrap hidden lg:table-cell">
                      <Typography variant="body" weight="medium" className="text-[#737373] font-lexend text-sm">
                        {formatSpecialty(t, row.clinicalSpecialty)}
                      </Typography>
                    </td>
                    <td className="px-4 whitespace-nowrap hidden md:table-cell">
                      <Typography variant="body" weight="medium" className="text-[#737373] font-lexend text-sm">
                        {formatServiceType(row.serviceType)}
                      </Typography>
                    </td>
                    <td className="px-4 whitespace-nowrap">
                      <StatusBadge
                        needsAttention={row.needsAttention}
                        reasons={row.attentionReasons}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
