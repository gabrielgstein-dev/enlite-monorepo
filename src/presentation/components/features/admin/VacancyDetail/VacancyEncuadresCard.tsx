import { useMemo, useState } from 'react';
import { Typography } from '@presentation/components/atoms/Typography';
import { TablePagination } from '@presentation/components/molecules/TablePagination/TablePagination';

interface Encuadre {
  id: string;
  worker_name: string | null;
  worker_phone: string | null;
  interview_date: string | null;
  resultado: string | null;
  attended: boolean | null;
}

interface VacancyEncuadresCardProps {
  encuadres: Encuadre[];
}

const HEADERS = ['Worker', 'Data', 'Resultado', 'Presente'] as const;
const DEFAULT_ITEMS_PER_PAGE = 10;

export function VacancyEncuadresCard({ encuadres }: VacancyEncuadresCardProps) {
  const safeEncuadres = useMemo(() => encuadres ?? [], [encuadres]);

  const [filterResultado, setFilterResultado] = useState('');
  const [filterPresente, setFilterPresente] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_ITEMS_PER_PAGE);

  const resultadoOptions = useMemo(() => {
    const unique = Array.from(new Set(safeEncuadres.map((e) => e.resultado).filter(Boolean))) as string[];
    return unique.sort();
  }, [safeEncuadres]);

  const filtered = useMemo(() => {
    return safeEncuadres.filter((e) => {
      if (filterResultado && e.resultado !== filterResultado) return false;
      if (filterPresente === 'sim' && e.attended !== true) return false;
      if (filterPresente === 'nao' && e.attended !== false) return false;
      return true;
    });
  }, [safeEncuadres, filterResultado, filterPresente]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, filtered.length);
  const paginated = filtered.slice(startIndex, endIndex);

  function handleFilterChange(setter: (v: string) => void) {
    return (e: React.ChangeEvent<HTMLSelectElement>) => {
      setter(e.target.value);
      setCurrentPage(1);
    };
  }

  function handleItemsPerPageChange(value: number) {
    setItemsPerPage(value);
    setCurrentPage(1);
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Typography variant="h3" weight="semibold" className="text-[#737373]">
          Encuadres recentes
        </Typography>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Filtro Resultado */}
          <div className="relative">
            <select
              value={filterResultado}
              onChange={handleFilterChange(setFilterResultado)}
              className="px-3 py-2 pr-8 rounded-[10px] border-[1.5px] border-[#D9D9D9] font-lexend font-medium text-sm text-[#180149] bg-white appearance-none cursor-pointer focus:outline-none"
            >
              <option value="">Todos os resultados</option>
              {resultadoOptions.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          {/* Filtro Presente */}
          <div className="relative">
            <select
              value={filterPresente}
              onChange={handleFilterChange(setFilterPresente)}
              className="px-3 py-2 pr-8 rounded-[10px] border-[1.5px] border-[#D9D9D9] font-lexend font-medium text-sm text-[#180149] bg-white appearance-none cursor-pointer focus:outline-none"
            >
              <option value="">Todos (presente)</option>
              <option value="sim">Presente: Sim</option>
              <option value="nao">Presente: Não</option>
            </select>
            <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      {safeEncuadres.length === 0 ? (
        <Typography variant="body" className="text-[#737373]">
          Nenhum encuadre registrado.
        </Typography>
      ) : (
        <>
          <div className="rounded-xl overflow-hidden border border-[#ECEFF1]">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="h-11 bg-[#EEEEEE]">
                    {HEADERS.map((h) => (
                      <th key={h} className="text-left px-4 whitespace-nowrap">
                        <Typography variant="body" weight="medium" className="text-[#737373] font-lexend text-base">
                          {h}
                        </Typography>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ECEFF1]">
                  {paginated.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="h-24 text-center">
                        <Typography variant="body" className="text-[#737373]">
                          Nenhum encuadre para os filtros selecionados.
                        </Typography>
                      </td>
                    </tr>
                  ) : (
                    paginated.map((e) => (
                      <tr key={e.id} className="h-12 bg-white">
                        <td className="px-4">
                          <Typography variant="body" weight="medium" className="text-[#737373] font-lexend text-sm">
                            {e.worker_name ?? '—'}
                          </Typography>
                        </td>
                        <td className="px-4 whitespace-nowrap">
                          <Typography variant="body" weight="medium" className="text-[#737373] font-lexend text-sm">
                            {e.interview_date
                              ? new Date(e.interview_date).toLocaleDateString('pt-BR')
                              : '—'}
                          </Typography>
                        </td>
                        <td className="px-4 whitespace-nowrap">
                          <Typography variant="body" weight="medium" className="text-[#737373] font-lexend text-sm">
                            {e.resultado ?? '—'}
                          </Typography>
                        </td>
                        <td className="px-4 whitespace-nowrap">
                          <Typography variant="body" weight="medium" className="text-[#737373] font-lexend text-sm">
                            {e.attended === null ? '—' : e.attended ? 'Sim' : 'Não'}
                          </Typography>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <TablePagination
            currentPage={safePage}
            totalPages={totalPages}
            totalItems={filtered.length}
            itemsPerPage={itemsPerPage}
            startIndex={startIndex}
            endIndex={endIndex}
            onPrevPage={() => setCurrentPage((p) => Math.max(1, p - 1))}
            onNextPage={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            onItemsPerPageChange={handleItemsPerPageChange}
          />
        </>
      )}
    </div>
  );
}
