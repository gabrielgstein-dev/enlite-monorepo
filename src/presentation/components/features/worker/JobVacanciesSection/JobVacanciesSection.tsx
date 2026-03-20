import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { SearchInput } from '@presentation/components/molecules/SearchBar';
import { SelectField, type SelectOption } from '@presentation/components/molecules/SelectField';
import { JobFilters } from '@presentation/components/molecules/JobFilters';
import { JobsTable } from '@presentation/components/organisms/JobsTable';
import { TablePagination } from '@presentation/components/molecules/TablePagination';

interface JobRow {
  id: string;
  tipo: string;
  local: string;
  sexo: string;
  status: string;
  urgencia: string;
  diagnostico: string;
}

interface TableHeader {
  label: string;
  key: keyof JobRow;
}

interface Filters {
  search: string;
  status: string;
  tipo: string;
  local: string;
  area: string;
  sexo: string;
}

export const JobVacanciesSection = (): JSX.Element => {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<Filters>({
    search: '',
    status: 'Inscrito',
    tipo: '',
    local: '',
    area: '',
    sexo: '',
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  const allJobs: JobRow[] = useMemo(() => [
    {
      id: '0364-01',
      tipo: 'Cuidador',
      local: 'Buenos Aires, Argentina',
      sexo: 'Mulher',
      status: 'Selecionado',
      urgencia: 'Urgente',
      diagnostico: 'Transtorno do espectro autista',
    },
    {
      id: '0364-02',
      tipo: 'AT',
      local: 'Buenos Aires, Argentina',
      sexo: 'Mulher',
      status: 'Selecionado',
      urgencia: 'Urgente',
      diagnostico: 'Transtorno do espectro autista',
    },
    {
      id: '0364-03',
      tipo: 'Cuidador',
      local: 'São Paulo, Brasil',
      sexo: 'Homem',
      status: 'Inscrito',
      urgencia: 'Normal',
      diagnostico: 'Alzheimer',
    },
    {
      id: '0364-04',
      tipo: 'AT',
      local: 'Rio de Janeiro, Brasil',
      sexo: 'Mulher',
      status: 'Inscrito',
      urgencia: 'Urgente',
      diagnostico: 'TDAH',
    },
  ], []);

  const tableHeaders: TableHeader[] = [
    { label: t('jobs.table.name', 'NOME'), key: 'id' },
    { label: t('jobs.table.type', 'TIPO'), key: 'tipo' },
    { label: t('jobs.table.location', 'LOCAL'), key: 'local' },
    { label: t('jobs.table.gender', 'SEXO'), key: 'sexo' },
    { label: t('jobs.table.status', 'STATUS'), key: 'status' },
    { label: t('jobs.table.urgency', 'URGÊNCIA'), key: 'urgencia' },
    { label: t('jobs.table.diagnosis', 'DIAGNÓSTICO'), key: 'diagnostico' },
  ];

  const tipoOptions: SelectOption[] = [
    { value: '', label: 'Todos' },
    { value: 'Cuidador', label: 'Cuidador' },
    { value: 'AT', label: 'AT' },
  ];

  const localOptions: SelectOption[] = [
    { value: '', label: 'Todos' },
    { value: 'Buenos Aires, Argentina', label: 'Buenos Aires' },
    { value: 'São Paulo, Brasil', label: 'São Paulo' },
    { value: 'Rio de Janeiro, Brasil', label: 'Rio de Janeiro' },
  ];

  const areaOptions: SelectOption[] = [
    { value: '', label: 'Todas' },
    { value: 'Saúde Mental', label: 'Saúde Mental' },
    { value: 'Geriatria', label: 'Geriatria' },
  ];

  const sexoOptions: SelectOption[] = [
    { value: '', label: 'Todos' },
    { value: 'Mulher', label: 'Mulher' },
    { value: 'Homem', label: 'Homem' },
  ];

  const statusOptions: SelectOption[] = [
    { value: 'Inscrito', label: 'Inscrito' },
    { value: 'Selecionado', label: 'Selecionado' },
    { value: 'Todos', label: 'Todos' },
  ];

  const filteredJobs = useMemo((): JobRow[] => {
    return allJobs.filter((job) => {
      const matchesSearch = filters.search === '' || 
        job.id.toLowerCase().includes(filters.search.toLowerCase()) ||
        job.diagnostico.toLowerCase().includes(filters.search.toLowerCase());
      
      const matchesStatus = filters.status === 'Todos' || job.status === filters.status;
      const matchesTipo = filters.tipo === '' || job.tipo === filters.tipo;
      const matchesLocal = filters.local === '' || job.local === filters.local;
      const matchesSexo = filters.sexo === '' || job.sexo === filters.sexo;

      return matchesSearch && matchesStatus && matchesTipo && matchesLocal && matchesSexo;
    });
  }, [allJobs, filters]);

  const totalItems = filteredJobs.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
  const paginatedJobs = filteredJobs.slice(startIndex, endIndex);

  const handleFilterChange = (key: keyof Filters, value: string): void => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  };

  const handleNextPage = (): void => {
    if (currentPage < totalPages) {
      setCurrentPage((prev) => prev + 1);
    }
  };

  const handlePrevPage = (): void => {
    if (currentPage > 1) {
      setCurrentPage((prev) => prev - 1);
    }
  };

  const handleItemsPerPageChange = (value: number): void => {
    setItemsPerPage(value);
    setCurrentPage(1);
  };

  return (
    <div className="flex flex-col w-full gap-6">
      <div className="flex flex-col w-full">
        {/* Header */}
        <div className="w-full h-[79px] bg-white rounded-t-[20px] border-2 border-[#D9D9D9]">
          <div className="flex w-full items-center justify-start px-8 h-full">
            <h2 className="font-poppins text-2xl font-semibold text-[#737373]">
              {t('jobs.title', 'Consultar Vagas')}
            </h2>
          </div>
        </div>

        {/* Content */}
        <div className="w-full bg-white rounded-b-[20px] border-r-2 border-b-2 border-l-2 border-[#D9D9D9]">
          <div className="flex flex-col gap-6 p-8">
            {/* Search and Status */}
            <div className="flex w-full items-end gap-4">
              <SearchInput
                value={filters.search}
                onChange={(value) => handleFilterChange('search', value)}
                placeholder={t('jobs.searchPlaceholder', 'Pesquisar pelo nome da vacante')}
                className="flex-1"
              />
              <SelectField
                value={filters.status}
                onChange={(value) => handleFilterChange('status', value)}
                options={statusOptions}
                label={t('jobs.status', 'Status')}
                className="w-[220px]"
              />
            </div>

            {/* Filters */}
            <JobFilters
              tipoValue={filters.tipo}
              localValue={filters.local}
              areaValue={filters.area}
              sexoValue={filters.sexo}
              onTipoChange={(value) => handleFilterChange('tipo', value)}
              onLocalChange={(value) => handleFilterChange('local', value)}
              onAreaChange={(value) => handleFilterChange('area', value)}
              onSexoChange={(value) => handleFilterChange('sexo', value)}
              tipoOptions={tipoOptions}
              localOptions={localOptions}
              areaOptions={areaOptions}
              sexoOptions={sexoOptions}
            />

            {/* Table */}
            <JobsTable
              jobs={paginatedJobs}
              headers={tableHeaders}
              emptyMessage={t('jobs.noResults', 'Nenhuma vaga encontrada com os filtros selecionados')}
            />
          </div>
        </div>
      </div>

      {/* Pagination */}
      <TablePagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={itemsPerPage}
        startIndex={startIndex}
        endIndex={endIndex}
        onPrevPage={handlePrevPage}
        onNextPage={handleNextPage}
        onItemsPerPageChange={handleItemsPerPageChange}
      />
    </div>
  );
};
