import { useState } from 'react';
import { Input } from '../../ui/Input';
import { Dropdown } from '../../ui/Dropdown';
import { Table, TableRow, TableCell, TableColumn } from '../../common/Table';
import { Pagination } from '../../common/Pagination';

interface JobVacancy {
  id: string;
  tipo: string;
  local: string;
  sexo: string;
  status: string;
  urgencia: string;
  diagnostico: string;
}

interface FilterOption {
  label: string;
  placeholder: string;
}

export const JobVacanciesSection = () => {
  const [searchValue, setSearchValue] = useState('');
  const [statusValue, setStatusValue] = useState('Inscrito');

  const tableRows: JobVacancy[] = [
    {
      id: '0364-01',
      tipo: 'Cuidador',
      local: 'Buenos Aires,\nArgentina',
      sexo: 'Mulher',
      status: 'Selecionado',
      urgencia: 'Urgente',
      diagnostico: 'Transtorno do\nespectro autista',
    },
    {
      id: '0364-02',
      tipo: 'AT',
      local: 'Buenos Aires,\nArgentina',
      sexo: 'Mulher',
      status: 'Selecionado',
      urgencia: 'Urgente',
      diagnostico: 'Transtorno do\nespectro autista',
    },
  ];

  const tableColumns: TableColumn[] = [
    { key: 'nome', label: 'NOME', position: 'left-20' },
    { key: 'tipo', label: 'TIPO', position: 'left-[202px]' },
    { key: 'local', label: 'LOCAL', position: 'left-[315px]' },
    { key: 'sexo', label: 'SEXO', position: 'left-[456px]' },
    { key: 'status', label: 'STATUS', position: 'left-[557px]' },
    { key: 'urgencia', label: 'URGÊNCIA', position: 'left-[698px]' },
    { key: 'diagnostico', label: 'DIAGNÓSTICO', position: 'left-[832px]' },
  ];

  const dropdownFilters: FilterOption[] = [
    { label: 'Tipos de vacantes', placeholder: 'Tipos' },
    { label: 'Lugares de trabalho', placeholder: 'Lugares' },
    { label: 'Áreas', placeholder: 'Áreas' },
    { label: 'Sexo', placeholder: 'Sexo' },
  ];

  const renderMultilineText = (text: string) => {
    return text.split('\n').map((line, i, arr) => (
      <span key={i}>
        {line}
        {i < arr.length - 1 && <br />}
      </span>
    ));
  };

  return (
    <div className="inline-flex flex-col items-end justify-end gap-6 w-full">
      <div className="inline-flex flex-col items-start relative flex-[0_0_auto] w-full">
        <div className="relative w-full h-[79px] bg-white rounded-[20px_20px_0px_0px] overflow-hidden border-solid border-t-2 border-r-2 border-b-[1.5px] border-l-2 border-graygray-600">
          <div className="flex w-full items-center justify-center relative top-[calc(50.00%_-_16px)] px-8">
            <div className="relative w-fit mt-[-1.00px] font-head-web-head-24-web font-[number:var(--head-web-head-24-web-font-weight)] text-graygray-800 text-[length:var(--head-web-head-24-web-font-size)] tracking-[var(--head-web-head-24-web-letter-spacing)] leading-[var(--head-web-head-24-web-line-height)] whitespace-nowrap [font-style:var(--head-web-head-24-web-font-style)]">
              Consultar Vagas
            </div>
          </div>
        </div>

        <div className="relative w-full min-h-[436px] bg-white rounded-[0px_0px_20px_20px] overflow-hidden border-r-2 [border-right-style:solid] border-b-2 [border-bottom-style:solid] border-l-2 [border-left-style:solid] border-graygray-600">
          <div className="inline-flex flex-col items-start gap-3.5 relative top-7 left-7">
            <div className="flex w-[986px] items-end gap-4 relative flex-[0_0_auto]">
              <div className="flex flex-col w-[735.5px] items-start gap-1 relative">
                <Input
                  type="text"
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  placeholder="Pesquisar pelo nome da vacante"
                  icon="https://c.animaapp.com/rTGW2XnX/img/24-outline-actions-search.svg"
                  rounded="full"
                />
              </div>

              <Dropdown
                label="Status"
                placeholder={statusValue}
                value={statusValue}
                className="w-[234.5px]"
              />
            </div>

            <div className="inline-flex items-center gap-4 relative flex-[0_0_auto]">
              {dropdownFilters.map((filter) => (
                <Dropdown
                  key={filter.label}
                  label={filter.label}
                  placeholder={filter.placeholder}
                  className="w-[234.5px]"
                />
              ))}
            </div>

            <div className="relative w-[986px] h-[188px]">
              <Table columns={tableColumns}>
                {tableRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell position="left-[84px]" align="center">
                      {row.id}
                    </TableCell>

                    <TableCell position="left-[202px]">{row.tipo}</TableCell>

                    <TableCell position="left-[315px]" className="top-[calc(50.00%_-_20px)]">
                      {renderMultilineText(row.local)}
                    </TableCell>

                    <TableCell position="left-[456px]">{row.sexo}</TableCell>

                    <TableCell position="left-[557px]">{row.status}</TableCell>

                    <TableCell position="left-[698px]">{row.urgencia}</TableCell>

                    <TableCell position="left-[840px]" align="center" className="top-[calc(50.00%_-_20px)]">
                      {renderMultilineText(row.diagnostico)}
                    </TableCell>

                    <img
                      className="absolute w-[97.57%] h-[69.44%] top-[30.56%] left-[2.43%]"
                      alt="View details"
                      src="https://c.animaapp.com/rTGW2XnX/img/eye-1@2x.png"
                    />
                  </TableRow>
                ))}
              </Table>
            </div>
          </div>
        </div>
      </div>

      <Pagination
        currentPage={1}
        totalPages={14}
        itemsPerPage={20}
        totalItems={270}
        className="w-full"
      />
    </div>
  );
};
