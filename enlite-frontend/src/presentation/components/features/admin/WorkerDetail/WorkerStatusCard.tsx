import { useTranslation } from 'react-i18next';
import { Typography } from '@presentation/components/atoms/Typography';
import { getPlatformLabel } from '@presentation/pages/admin/workersData';

interface WorkerStatusCardProps {
  status: string;
  dataSources: string[];
  platform: string;
  createdAt: string;
  updatedAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  REGISTERED: 'bg-green-100 text-green-700',
  INCOMPLETE_REGISTER: 'bg-yellow-100 text-yellow-700',
  DISABLED: 'bg-red-100 text-red-700',
};

const STATUS_I18N_KEYS: Record<string, string> = {
  REGISTERED: 'admin.workerDetail.statusRegistered',
  INCOMPLETE_REGISTER: 'admin.workerDetail.statusIncomplete',
  DISABLED: 'admin.workerDetail.statusDisabled',
};

export function WorkerStatusCard({
  status,
  dataSources,
  platform,
  createdAt,
  updatedAt,
}: WorkerStatusCardProps) {
  const { t } = useTranslation();
  const colorClass = STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600';
  const statusLabel = STATUS_I18N_KEYS[status] ? t(STATUS_I18N_KEYS[status]) : status;
  const platformLabel = getPlatformLabel(t, platform);
  const dataSourceLabels = dataSources.map((s) => getPlatformLabel(t, s));
  const created = new Date(createdAt).toLocaleDateString('pt-BR');
  const updated = new Date(updatedAt).toLocaleDateString('pt-BR');

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4">
      <Typography variant="h1" weight="semibold" as="h3" className="text-[#737373]">
        {t('admin.workerDetail.status')}
      </Typography>
      <div className="flex flex-col gap-3">
        <div className="flex justify-between items-center">
          <Typography variant="body" className="text-[#737373]">{t('admin.workerDetail.statusLabel')}</Typography>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${colorClass}`}>
            {statusLabel}
          </span>
        </div>
        <div className="flex justify-between">
          <Typography variant="body" className="text-[#737373]">
            {t('admin.workerDetail.platform')}
          </Typography>
          <Typography variant="body" weight="medium">{platformLabel}</Typography>
        </div>
        {dataSources.length > 0 && (
          <div className="flex justify-between">
            <Typography variant="body" className="text-[#737373]">
              {t('admin.workerDetail.dataSources')}
            </Typography>
            <Typography variant="body" weight="medium">{dataSourceLabels.join(', ')}</Typography>
          </div>
        )}
        <div className="flex justify-between">
          <Typography variant="body" className="text-[#737373]">
            {t('admin.workerDetail.createdAt')}
          </Typography>
          <Typography variant="body" weight="medium">{created}</Typography>
        </div>
        <div className="flex justify-between">
          <Typography variant="body" className="text-[#737373]">
            {t('admin.workerDetail.updatedAt')}
          </Typography>
          <Typography variant="body" weight="medium">{updated}</Typography>
        </div>
      </div>
    </div>
  );
}
