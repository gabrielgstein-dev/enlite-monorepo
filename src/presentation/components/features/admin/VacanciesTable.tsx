import { useTranslation } from 'react-i18next';
import { Typography } from '@presentation/components/atoms/Typography';

export interface VacancyRow {
  id: string;
  caso: string;
  status: string;
  grau: string;
  grauColor: string;
  convidados: string;
  postulados: string;
  selecionados: string;
  faltantes: string;
}

interface VacanciesTableProps {
  vacancies: VacancyRow[];
  onRowClick?: (id: string) => void;
}

const COLUMN_HEADERS = [
  'case',
  'status',
  'dependencyLevel',
  'invited',
  'applicants',
  'selected',
  'missing',
] as const;

export function VacanciesTable({ vacancies, onRowClick }: VacanciesTableProps): JSX.Element {
  const { t } = useTranslation();
  const safeVacancies = vacancies || [];

  return (
    <div className="w-full rounded-xl overflow-hidden border border-[#ECEFF1]">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[900px]">
          <thead>
            <tr className="h-11 bg-[#EEEEEE]">
              {/* eye icon column */}
              <th className="w-10 px-3" />
              {COLUMN_HEADERS.map((key) => (
                <th key={key} className="text-left px-4 whitespace-nowrap">
                  <Typography
                    variant="body"
                    weight="medium"
                    className="text-[#737373] font-lexend text-base"
                  >
                    {t(`admin.vacancies.table.${key}`)}
                  </Typography>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#ECEFF1]">
            {safeVacancies.length === 0 ? (
              <tr>
                <td colSpan={9} className="h-[200px] bg-white text-center">
                  <Typography variant="body" className="text-[#737373]">
                    {t('admin.vacancies.noVacancies')}
                  </Typography>
                </td>
              </tr>
            ) : (
              safeVacancies.map((row) => (
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
                    <Typography variant="body" weight="medium" className="text-[#737373] font-lexend text-sm">
                      {row.caso}
                    </Typography>
                  </td>
                  <td className="px-4 whitespace-nowrap">
                    <Typography variant="body" weight="medium" className="text-[#737373] font-lexend text-sm">
                      {row.status}
                    </Typography>
                  </td>
                  <td className="px-4 whitespace-nowrap">
                    <Typography variant="body" weight="medium" className={`font-lexend text-sm ${row.grauColor}`}>
                      {row.grau}
                    </Typography>
                  </td>
                  <td className="px-4 whitespace-nowrap">
                    <Typography variant="body" weight="medium" className="text-[#737373] font-lexend text-sm">
                      {row.convidados}
                    </Typography>
                  </td>
                  <td className="px-4 whitespace-nowrap">
                    <Typography variant="body" weight="medium" className="text-[#737373] font-lexend text-sm">
                      {row.postulados}
                    </Typography>
                  </td>
                  <td className="px-4 whitespace-nowrap">
                    <Typography variant="body" weight="medium" className="text-[#737373] font-lexend text-sm">
                      {row.selecionados}
                    </Typography>
                  </td>
                  <td className="px-4 whitespace-nowrap">
                    <Typography variant="body" weight="medium" className="text-[#737373] font-lexend text-sm">
                      {row.faltantes}
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
