import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Typography } from '@presentation/components/atoms/Typography';
import { Button } from '@presentation/components/atoms/Button';
import { SelectField } from '@presentation/components/molecules/SelectField';
import { VacancyStatsCards } from '@presentation/components/features/admin/VacancyStatsCards';
import { VacancyFilters } from '@presentation/components/features/admin/VacancyFilters';
import { VacanciesTable } from '@presentation/components/features/admin/VacanciesTable';
import { useVacanciesData } from '@hooks/admin/useVacanciesData';
import { getClientOptions, getStatusOptions } from './vacanciesData';
import { RefreshCw } from 'lucide-react';

export function AdminVacanciesPage(): JSX.Element {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const clientOptions = getClientOptions(t);
  const statusOptions = getStatusOptions(t);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('ativo');
  const [itemsPerPage, setItemsPerPage] = useState('20');

  // Fetch real data from API
  const filters = useMemo(() => ({
    search: searchQuery,
    client: selectedClient,
    status: selectedStatus,
    limit: itemsPerPage,
    offset: '0'
  }), [searchQuery, selectedClient, selectedStatus, itemsPerPage]);

  const { vacancies: rawVacancies, stats, total, isLoading, error } = useVacanciesData(filters);

  const vacancies = useMemo(
    () => (rawVacancies || []).map((v: any) => ({
      id: v.id,
      initials: v.case_number ? String(v.case_number).slice(-2) : '??',
      name: v.title || v.id,
      email: '',
      caso: v.case_number ? String(v.case_number) : v.id,
      status: v.status || '—',
      grau: v.dependency_level || '—',
      grauColor: 'text-[#737373]',
      diasAberto: '—',
      convidados: '—',
      postulados: '—',
      selecionados: v.providers_needed != null ? String(v.providers_needed) : '—',
      faltantes: '—',
    })),
    [rawVacancies],
  );

  console.log('[AdminVacanciesPage] Render state:', { 
    vacanciesCount: vacancies?.length, 
    vacancies,
    total, 
    isLoading, 
    error,
    statsCount: stats?.length,
    stats
  });

  if (isLoading) {
    return (
      <div className="w-full min-h-screen bg-[#FFF9FC] flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
          <Typography variant="h3" className="text-slate-600">
            {t('admin.vacancies.loading', 'Carregando vacantes...')}
          </Typography>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full min-h-screen bg-[#FFF9FC] flex items-center justify-center">
        <div className="text-center">
          <Typography variant="h3" className="text-red-600 mb-2">
            {t('admin.vacancies.errorLoading', 'Error al cargar vacantes')}
          </Typography>
          <Typography variant="body" className="text-slate-600">
            {error}
          </Typography>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-[#FFF9FC] px-[120px] py-8">
      {/* Page Title */}
      <div className="flex items-center justify-between mb-10">
        <Typography variant="h1" weight="semibold" color="primary" className="font-poppins text-2xl">
          {t('admin.vacancies.title')}
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

      <VacancyStatsCards stats={stats} />

      {/* Vacancies Section */}
      <div className="flex flex-col gap-7">
        {/* Header with Title and New Button */}
        <div className="bg-white rounded-t-[20px] border-t-2 border-r-2 border-b-[1.5px] border-l-2 border-[#D9D9D9] h-24 flex items-center justify-between px-7">
          <Typography variant="h1" weight="semibold" className="text-[#737373] font-poppins text-2xl">
            {t('admin.vacancies.vacanciesTitle')}
          </Typography>
          <Button
            variant="outline"
            size="md"
            className="w-40 h-10 border-primary text-primary flex items-center justify-center gap-3"
          >
            <Typography variant="h3" weight="semibold" className="text-primary font-poppins text-base">
              {t('admin.vacancies.new')}
            </Typography>
            <img
              className="w-[13.5px] h-[13.5px]"
              alt="Add"
              src="https://c.animaapp.com/UVSSEdVv/img/icon@2x.png"
            />
          </Button>
        </div>

        <VacancyFilters
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedClient={selectedClient}
          onClientChange={setSelectedClient}
          selectedStatus={selectedStatus}
          onStatusChange={setSelectedStatus}
          clientOptions={clientOptions}
          statusOptions={statusOptions}
        />

        <VacanciesTable
          vacancies={vacancies}
          onRowClick={(id) => navigate(`/admin/vacancies/${id}`)}
        />

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
            {t('admin.vacancies.pagination', { 
              start: 1, 
              end: Math.min(parseInt(itemsPerPage), total), 
              total 
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
