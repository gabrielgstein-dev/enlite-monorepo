import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Typography } from '@presentation/components/atoms/Typography';
import { Button } from '@presentation/components/atoms/Button';
import { SelectField } from '@presentation/components/molecules/SelectField';
import { VacancyStatsCards } from '@presentation/components/features/admin/VacancyStatsCards';
import { VacancyFilters } from '@presentation/components/features/admin/VacancyFilters';
import { VacanciesTable } from '@presentation/components/features/admin/VacanciesTable';
import { VacancyFormModal } from '@presentation/components/features/admin/VacancyFormModal';
import { useVacanciesData } from '@hooks/admin/useVacanciesData';
import { getClientOptions, getStatusOptions, getPriorityOptions } from './vacanciesData';
import { TableSkeleton } from '@presentation/components/ui/skeletons';

export function AdminVacanciesPage(): JSX.Element {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const clientOptions = getClientOptions(t);
  const statusOptions = getStatusOptions(t);
  const priorityOptions = getPriorityOptions(t);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('ativo');
  const [selectedPriority, setSelectedPriority] = useState('');
  const [itemsPerPage, setItemsPerPage] = useState('20');
  const [currentPage, setCurrentPage] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const handleSearchChange = (v: string) => { setSearchQuery(v); setCurrentPage(1); };
  const handleClientChange = (v: string) => { setSelectedClient(v); setCurrentPage(1); };
  const handleStatusChange = (v: string) => { setSelectedStatus(v); setCurrentPage(1); };
  const handlePriorityChange = (v: string) => { setSelectedPriority(v); setCurrentPage(1); };
  const handleItemsPerPageChange = (v: string) => { setItemsPerPage(v); setCurrentPage(1); };

  const filters = useMemo(() => ({
    search: searchQuery,
    client: selectedClient,
    status: selectedStatus,
    priority: selectedPriority,
    limit: itemsPerPage,
    offset: String((currentPage - 1) * parseInt(itemsPerPage)),
  }), [searchQuery, selectedClient, selectedStatus, selectedPriority, itemsPerPage, currentPage]);

  const { vacancies: rawVacancies, stats, total, isLoading, error } = useVacanciesData(filters);

  const vacancies = useMemo(
    () => (rawVacancies || []).map((v: any) => ({
      id: v.id,
      caso: v.caso ? String(v.caso) : v.id,
      status: v.status || '—',
      grau: v.dependency_level || '—',
      grauColor: v.grauColor,
      diasAberto: '—',
      convidados: v.convidados || '—',
      postulados: v.postulados || '—',
      selecionados: v.providers_needed != null ? String(v.providers_needed) : '—',
      faltantes: v.faltantes || '—',
    })),
    [rawVacancies],
  );

  return (
    <div className="w-full min-h-screen bg-[#FFF9FC] px-4 sm:px-8 lg:px-[120px] py-8">
      {/* Header */}
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

      {/* Table section */}
      <div className="flex flex-col">
        {/* Section header */}
        <div className="bg-white rounded-t-[20px] border-2 border-b-0 border-[#D9D9D9] h-24 flex items-center justify-between px-7">
          <Typography variant="h1" weight="semibold" className="text-[#737373] font-poppins text-2xl">
            {t('admin.vacancies.vacanciesTitle')}
          </Typography>
          <Button
            variant="outline"
            size="md"
            className="w-40 h-10 border-primary text-primary flex items-center justify-center gap-3"
            onClick={() => setShowCreateModal(true)}
          >
            <Typography variant="h3" weight="semibold" className="text-primary font-poppins text-base">
              {t('admin.vacancies.new')}
            </Typography>
            <Plus className="w-3.5 h-3.5 text-primary" />
          </Button>
        </div>

        <VacancyFilters
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          selectedClient={selectedClient}
          onClientChange={handleClientChange}
          selectedStatus={selectedStatus}
          onStatusChange={handleStatusChange}
          selectedPriority={selectedPriority}
          onPriorityChange={handlePriorityChange}
          clientOptions={clientOptions}
          statusOptions={statusOptions}
          priorityOptions={priorityOptions}
        />

        {error ? (
          <div className="mt-6 py-8 text-center">
            <Typography variant="h3" className="text-red-600 mb-2">
              {t('admin.vacancies.errorLoading')}
            </Typography>
            <Typography variant="body" className="text-slate-600">{error}</Typography>
          </div>
        ) : isLoading ? (
          <div className="mt-6"><TableSkeleton /></div>
        ) : (
          <div className="mt-6">
            <VacanciesTable
              vacancies={vacancies}
              onRowClick={(id) => navigate(`/admin/vacancies/${id}`)}
            />
          </div>
        )}

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-end gap-4 mt-6">
          <div className="w-full sm:w-[164px]">
            <SelectField
              options={[
                { value: '10', label: '10' },
                { value: '20', label: '20' },
                { value: '50', label: '50' },
              ]}
              value={itemsPerPage}
              onChange={handleItemsPerPageChange}
              placeholder="20"
            />
          </div>
          <Typography variant="body" weight="medium" className="text-[#737373] font-lexend text-base">
            {total === 0
              ? t('admin.vacancies.pagination', { start: 0, end: 0, total: 0 })
              : t('admin.vacancies.pagination', {
                  start: (currentPage - 1) * parseInt(itemsPerPage) + 1,
                  end: Math.min(currentPage * parseInt(itemsPerPage), total),
                  total,
                })}
          </Typography>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1 rounded disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer hover:bg-gray-100 transition-colors"
              aria-label={t('admin.vacancies.previousPage')}
            >
              <ChevronLeft className="w-4 h-4 text-[#737373]" />
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(Math.ceil(total / parseInt(itemsPerPage)), p + 1))}
              disabled={currentPage >= Math.ceil(total / parseInt(itemsPerPage))}
              className="p-1 rounded disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer hover:bg-gray-100 transition-colors"
              aria-label={t('admin.vacancies.nextPage')}
            >
              <ChevronRight className="w-4 h-4 text-[#737373]" />
            </button>
          </div>
        </div>
      </div>

      <VacancyFormModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={(id) => {
          setShowCreateModal(false);
          navigate(`/admin/vacancies/${id}`);
        }}
      />
    </div>
  );
}
