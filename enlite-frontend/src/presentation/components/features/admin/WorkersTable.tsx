import { useTranslation } from 'react-i18next';
import { Typography } from '@presentation/components/atoms/Typography';
import { PLATFORM_LABELS } from '@presentation/pages/admin/workersData';

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

const COLUMN_HEADERS = ['name', 'cases', 'documents', 'registeredAt', 'platform'] as const;

function formatDate(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function DocsStatusBadge({ complete, status }: { complete: boolean; status: string }) {
  if (complete) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
        Completo
      </span>
    );
  }
  const label = status === 'rejected' ? 'Rejeitado' : status === 'pending' ? 'Pendente' : 'Incompleto';
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
      {label}
    </span>
  );
}

export function WorkersTable({ workers, onRowClick }: WorkersTableProps): JSX.Element {
  const { t } = useTranslation();
  const safeWorkers = workers ?? [];

  return (
    <div className="w-full rounded-xl overflow-hidden border border-[#ECEFF1]">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[800px]">
          <thead>
            <tr className="h-11 bg-[#EEEEEE]">
              <th className="w-10 px-3" />
              {COLUMN_HEADERS.map((key) => (
                <th key={key} className="text-left px-4 whitespace-nowrap">
                  <Typography variant="body" weight="medium" className="text-[#737373] font-lexend text-base">
                    {t(`admin.workers.table.${key}`, {
                      name: 'Nome',
                      cases: 'Casos',
                      documents: 'Documentação',
                      registeredAt: 'Cadastro',
                      platform: 'Plataforma',
                    }[key])}
                  </Typography>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#ECEFF1]">
            {safeWorkers.length === 0 ? (
              <tr>
                <td colSpan={6} className="h-[200px] bg-white text-center">
                  <Typography variant="body" className="text-[#737373]">
                    {t('admin.workers.noWorkers', 'Nenhum worker encontrado')}
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
                    <img
                      className="w-6 h-6"
                      alt="View"
                      src="https://c.animaapp.com/UVSSEdVv/img/eye-6@2x.png"
                    />
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
                  <td className="px-4 whitespace-nowrap">
                    <Typography variant="body" weight="medium" className="text-[#737373] font-lexend text-sm">
                      {formatDate(row.createdAt)}
                    </Typography>
                  </td>
                  <td className="px-4 whitespace-nowrap">
                    <Typography variant="body" weight="medium" className="text-[#737373] font-lexend text-sm">
                      {PLATFORM_LABELS[row.platform] ?? row.platform ?? '—'}
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
