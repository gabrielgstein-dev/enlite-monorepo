import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Typography } from '@presentation/components/atoms/Typography';
import { SelectField } from '@presentation/components/molecules/SelectField';
import { WorkerFilters } from '@presentation/components/features/admin/WorkerFilters';
import { WorkersTable } from '@presentation/components/features/admin/WorkersTable';
import { useWorkersData } from '@hooks/admin/useWorkersData';
import { TableSkeleton } from '@presentation/components/ui/skeletons';
import { getPlatformOptions, getDocsStatusOptions } from './workersData';

export function AdminWorkersPage(): JSX.Element {
  const { t } = useTranslation();

  const platformOptions = getPlatformOptions(t);
  const docsStatusOptions = getDocsStatusOptions(t);

  const [selectedPlatform, setSelectedPlatform] = useState('');
  const [selectedDocsStatus, setSelectedDocsStatus] = useState('');
  const [itemsPerPage, setItemsPerPage] = useState('20');

  const filters = useMemo(
    () => ({
      platform: selectedPlatform || undefined,
      docs_complete: selectedDocsStatus || undefined,
      limit: itemsPerPage,
      offset: '0',
    }),
    [selectedPlatform, selectedDocsStatus, itemsPerPage],
  );

  const { workers: rawWorkers, total, isLoading, error } = useWorkersData(filters);

  const workers = useMemo(
    () =>
      (rawWorkers ?? []).map((w: any) => ({
        id: w.id,
        name: w.name ?? w.email ?? '—',
        email: w.email ?? '',
        casesCount: w.casesCount ?? 0,
        documentsComplete: w.documentsComplete ?? false,
        documentsStatus: w.documentsStatus ?? 'pending',
        platform: w.platform ?? '',
        createdAt: w.createdAt ?? '',
      })),
    [rawWorkers],
  );

  return (
    <div className="w-full min-h-screen bg-[#FFF9FC] px-[120px] py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-10">
        <Typography variant="h1" weight="semibold" color="primary" className="font-poppins text-2xl">
          {t('admin.workers.title', 'Workers')}
        </Typography>
        <div className="flex items-center gap-2">
          <img
            className="w-7 h-5"
            alt="Argentina"
            src="https://c.animaapp.com/UVSSEdVv/img/group-237688.svg"
          />
          <Typography variant="body" weight="medium" className="text-[#737373]">
            {t('common.country')}
          </Typography>
        </div>
      </div>

      {/* Table section */}
      <div className="flex flex-col gap-7">
        {/* Section header */}
        <div className="bg-white rounded-t-[20px] border-t-2 border-r-2 border-b-[1.5px] border-l-2 border-[#D9D9D9] h-24 flex items-center px-7">
          <Typography variant="h1" weight="semibold" className="text-[#737373] font-poppins text-2xl">
            {t('admin.workers.listTitle', 'Lista de Workers')}
          </Typography>
        </div>

        <WorkerFilters
          selectedPlatform={selectedPlatform}
          onPlatformChange={setSelectedPlatform}
          selectedDocsStatus={selectedDocsStatus}
          onDocsStatusChange={setSelectedDocsStatus}
          platformOptions={platformOptions}
          docsStatusOptions={docsStatusOptions}
        />

        {error ? (
          <div className="py-8 text-center">
            <Typography variant="h3" className="text-red-600 mb-2">
              {t('admin.workers.errorLoading', 'Erro ao carregar workers')}
            </Typography>
            <Typography variant="body" className="text-slate-600">{error}</Typography>
          </div>
        ) : isLoading ? (
          <TableSkeleton />
        ) : (
          <WorkersTable workers={workers} />
        )}

        {/* Pagination */}
        <div className="flex items-center justify-end gap-4">
          <div className="w-[164px]">
            <SelectField
              options={[
                { value: '10', label: '10' },
                { value: '20', label: '20' },
                { value: '50', label: '50' },
              ]}
              value={itemsPerPage}
              onChange={setItemsPerPage}
              placeholder="20"
            />
          </div>
          <Typography variant="body" weight="medium" className="text-[#737373] font-lexend text-base">
            {t('admin.workers.pagination', {
              start: 1,
              end: Math.min(parseInt(itemsPerPage), total),
              total,
              defaultValue: `1–${Math.min(parseInt(itemsPerPage), total)} de ${total}`,
            })}
          </Typography>
          <img
            className="w-[35px] h-[14px]"
            alt="Pagination arrows"
            src="https://c.animaapp.com/UVSSEdVv/img/setas.svg"
          />
        </div>
      </div>
    </div>
  );
}
