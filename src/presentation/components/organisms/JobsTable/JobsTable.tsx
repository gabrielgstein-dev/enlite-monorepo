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

interface JobsTableProps {
  jobs: JobRow[];
  headers: TableHeader[];
  emptyMessage?: string;
}

const TABLE_GRID_COLS = "grid-cols-[40px_1fr_1fr_1.5fr_1fr_1fr_1fr_1.5fr]";

export const JobsTable = ({
  jobs,
  headers,
  emptyMessage = 'Nenhuma vaga encontrada com os filtros selecionados',
}: JobsTableProps): JSX.Element => {
  return (
    <div className="flex flex-col w-full rounded-xl overflow-hidden border border-[#D9D9D9]">
      {/* Table Header */}
      <div className={`w-full h-11 bg-[#EEEEEE] grid ${TABLE_GRID_COLS} items-center px-4`}>
        <div></div>
        {headers.map((header) => (
          <div
            key={header.key}
            className="font-lexend font-medium text-[#737373] text-base uppercase px-2"
          >
            {header.label}
          </div>
        ))}
      </div>

      {/* Table Rows */}
      {jobs.length > 0 ? (
        jobs.map((row) => (
          <div
            key={row.id}
            className={`w-full min-h-[56px] grid ${TABLE_GRID_COLS} items-center px-4 border-t border-[#D9D9D9] hover:bg-gray-50 transition-colors`}
          >
            <div className="flex items-center justify-center">
              <button className="p-1 hover:bg-transparent rounded-full transition-colors bg-transparent border-0">
                <svg className="w-5 h-5 text-[#737373]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </button>
            </div>
            <div className="font-lexend font-medium text-[#737373] text-sm px-2 truncate">
              {row.id}
            </div>
            <div className="font-lexend font-medium text-[#737373] text-sm px-2 truncate">
              {row.tipo}
            </div>
            <div className="font-lexend font-medium text-[#737373] text-sm px-2 truncate">
              {row.local}
            </div>
            <div className="font-lexend font-medium text-[#737373] text-sm px-2 truncate">
              {row.sexo}
            </div>
            <div className="px-2">
              <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
                row.status === 'Selecionado' 
                  ? 'bg-blue-100 text-blue-700 border border-blue-300' 
                  : 'bg-gray-100 text-gray-700 border border-gray-300'
              }`}>
                {row.status}
              </span>
            </div>
            <div className="font-lexend font-medium text-[#737373] text-sm px-2 truncate">
              {row.urgencia}
            </div>
            <div className="font-lexend font-medium text-[#737373] text-sm px-2 truncate">
              {row.diagnostico}
            </div>
          </div>
        ))
      ) : (
        <div className="w-full py-12 text-center border-t border-[#D9D9D9]">
          <p className="font-lexend text-[#737373] text-sm">
            {emptyMessage}
          </p>
        </div>
      )}
    </div>
  );
};
