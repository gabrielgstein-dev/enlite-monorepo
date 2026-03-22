import { useState } from 'react';
import { Typography } from '@presentation/components/atoms/Typography';
import { Button } from '@presentation/components/atoms/Button';
import { SelectField } from '@presentation/components/molecules/SelectField';
import { VacancyStatsCards } from '@presentation/components/features/admin/VacancyStatsCards';
import { VacancyFilters } from '@presentation/components/features/admin/VacancyFilters';
import { VacanciesTable } from '@presentation/components/features/admin/VacanciesTable';
import { mockVacancies, statsData, clientOptions, statusOptions } from './vacanciesData';

export function AdminVacanciesPage(): JSX.Element {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('ativo');
  const [itemsPerPage, setItemsPerPage] = useState('20');

  return (
    <div className="w-full min-h-screen bg-[#FFF9FC] px-[120px] py-8">
      {/* Page Title */}
      <div className="flex items-center justify-between mb-10">
        <Typography variant="h1" weight="semibold" color="primary" className="font-poppins text-2xl">
          Vacantes - Solicitações
        </Typography>
        <div className="flex items-center gap-2">
          <img
            className="w-7 h-5"
            alt="Argentina"
            src="https://c.animaapp.com/UVSSEdVv/img/group-237688.svg"
          />
          <Typography variant="body" weight="medium" className="text-[#737373]">
            Argentina
          </Typography>
        </div>
      </div>

      <VacancyStatsCards stats={statsData} />

      {/* Vacancies Section */}
      <div className="flex flex-col gap-7">
        {/* Header with Title and New Button */}
        <div className="bg-white rounded-t-[20px] border-t-2 border-r-2 border-b-[1.5px] border-l-2 border-[#D9D9D9] h-24 flex items-center justify-between px-7">
          <Typography variant="h1" weight="semibold" className="text-[#737373] font-poppins text-2xl">
            Vacantes
          </Typography>
          <Button
            variant="outline"
            size="md"
            className="w-40 h-10 border-primary text-primary flex items-center justify-center gap-3"
          >
            <Typography variant="h3" weight="semibold" className="text-primary font-poppins text-base">
              Novo
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

        <VacanciesTable vacancies={mockVacancies} />

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
            1 - 20 de 270
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
