import { useTranslation } from 'react-i18next';
import { Eye } from 'lucide-react';
import { Typography } from '@presentation/components/atoms/Typography';
import { getPlatformLabel } from '@presentation/pages/admin/workersData';

export interface WorkerRow {
  id: string;
  name: string;
  email: string;
  casesCount: number;
  documentsComplete: boolean;
  documentsStatus: string;
  platform: string;
  createdAt: string;
}

interface WorkersTableProps {
  workers: WorkerRow[];
  onRowClick?: (id: string) => void;
}

const COLUMNS = [
  { key: 'name', hiddenClass: '' },
  { key: 'cases', hiddenClass: '' },
  { key: 'documents', hiddenClass: '' },
  { key: 'registeredAt', hiddenClass: 'hidden md:table-cell' },
  { key: 'platform', hiddenClass: 'hidden md:table-cell' },
] as const;

function formatDate(iso: string, locale: string): string {
  if (!iso) return '—';
  const dateLocale = locale === 'es' ? 'es-AR' : 'pt-BR';
  return new Date(iso).toLocaleDateString(dateLocale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function DocsStatusBadge({ complete, status }: { complete: boolean; status: string }) {
  const { t } = useTranslation();
  if (complete) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
        {t('admin.workers.docsStatus.complete')}
      </span>
    );
  }
  const statusKey = status === 'rejected' ? 'rejected' : status === 'pending' ? 'pending' : 'incomplete';
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
      {t(`admin.workers.docsStatus.${statusKey}`)}
    </span>
  );
}

export function WorkersTable({ workers, onRowClick }: WorkersTableProps): JSX.Element {
  const { t, i18n } = useTranslation();
  const safeWorkers = workers ?? [];

  return (
    <div className="w-full rounded-xl overflow-hidden border border-[#ECEFF1]">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[500px]">
          <thead>
            <tr className="h-11 bg-[#EEEEEE]">
              <th className="w-10 px-3" />
              {COLUMNS.map(({ key, hiddenClass }) => (
                <th key={key} className={`text-left px-4 whitespace-nowrap ${hiddenClass}`}>
                  <Typography variant="body" weight="medium" className="text-[#737373] font-lexend text-base">
                    {t(`admin.workers.table.${key}`)}
                  </Typography>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#ECEFF1]">
            {safeWorkers.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="h-[200px] bg-white text-center">
                  <Typography variant="body" className="text-[#737373]">
                    {t('admin.workers.noWorkers')}
                  </Typography>
                </td>
              </tr>
            ) : (
              safeWorkers.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => onRowClick?.(row.id)}
                  className={`h-[72px] bg-white ${onRowClick ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                >
                  <td className="px-3">
                    <Eye className="w-5 h-5 text-[#737373]" aria-label={t('admin.workers.table.view')} />
                  </td>
                  <td className="px-4">
                    <div>
                      <Typography variant="body" weight="medium" className="text-[#737373] font-lexend text-sm">
                        {row.name}
                      </Typography>
                      <Typography variant="body" className="text-[#AEAEAE] font-lexend text-xs">
                        {row.email}
                      </Typography>
                    </div>
                  </td>
                  <td className="px-4 whitespace-nowrap">
                    <Typography variant="body" weight="medium" className="text-[#737373] font-lexend text-sm">
                      {row.casesCount}
                    </Typography>
                  </td>
                  <td className="px-4 whitespace-nowrap">
                    <DocsStatusBadge complete={row.documentsComplete} status={row.documentsStatus} />
                  </td>
                  <td className="px-4 whitespace-nowrap hidden md:table-cell">
                    <Typography variant="body" weight="medium" className="text-[#737373] font-lexend text-sm">
                      {formatDate(row.createdAt, i18n.language)}
                    </Typography>
                  </td>
                  <td className="px-4 whitespace-nowrap hidden md:table-cell">
                    <Typography variant="body" weight="medium" className="text-[#737373] font-lexend text-sm">
                      {getPlatformLabel(t, row.platform)}
                    </Typography>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
