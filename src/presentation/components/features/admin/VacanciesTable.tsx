import { useTranslation } from 'react-i18next';
import { Typography } from '@presentation/components/atoms/Typography';

export interface VacancyRow {
  id: string;
  initials: string;
  name: string;
  email: string;
  caso: string;
  status: string;
  grau: string;
  grauColor: string;
  diasAberto: string;
  convidados: string;
  postulados: string;
  selecionados: string;
  faltantes: string;
}

interface VacanciesTableProps {
  vacancies: VacancyRow[];
  onRowClick?: (id: string) => void;
}

interface TableHeader {
  key: string;
  ml: string;
  width: string;
}

const TABLE_HEADERS: TableHeader[] = [
  { key: 'name', ml: 'ml-24', width: 'w-[50px]' },
  { key: 'case', ml: 'ml-[290px]', width: 'w-[45px]' },
  { key: 'status', ml: 'ml-[71px]', width: 'w-[61px]' },
  { key: 'dependencyLevel', ml: 'ml-[111px]', width: 'w-[199px]' },
  { key: 'daysOpen', ml: 'ml-[29px]', width: 'w-[140px]' },
  { key: 'invited', ml: 'ml-9', width: 'w-[114px]' },
  { key: 'applicants', ml: 'ml-[34px]', width: 'w-[111px]' },
  { key: 'selected', ml: 'ml-[37px]', width: 'w-[130px]' },
  { key: 'missing', ml: 'ml-[42px]', width: 'w-[91px]' },
];

export function VacanciesTable({ vacancies, onRowClick }: VacanciesTableProps): JSX.Element {
  const { t } = useTranslation();
  const safeVacancies = vacancies || [];

  console.log('[VacanciesTable] Received vacancies:', vacancies);
  console.log('[VacanciesTable] Safe vacancies length:', safeVacancies.length);
  console.log('[VacanciesTable] Safe vacancies:', safeVacancies);

  return (
    <div className="w-full overflow-hidden">
      {/* Table Header */}
      <div className="w-full h-11 bg-[#EEEEEE] rounded-t-xl flex items-center px-4">
        {TABLE_HEADERS.map((header, index) => (
          <Typography
            key={index}
            variant="body"
            weight="medium"
            className={`text-[#737373] ${header.width} ${header.ml} font-lexend text-base`}
          >
            {t(`admin.vacancies.table.${header.key}`)}
          </Typography>
        ))}
      </div>

      {/* Table Rows */}
      <div className="flex flex-col w-full">
        {safeVacancies.length === 0 ? (
          <div className="w-full h-[200px] bg-white border border-[#ECEFF1] rounded-b-xl flex items-center justify-center">
            <Typography variant="body" className="text-[#737373]">
              {t('admin.vacancies.noVacancies')}
            </Typography>
          </div>
        ) : (
          safeVacancies.map((row, index) => (
          <div
            key={row.id}
            onClick={() => onRowClick?.(row.id)}
            className={`relative w-full h-[72px] bg-white border border-[#ECEFF1] flex items-center ${onRowClick ? 'cursor-pointer hover:bg-slate-50' : ''} ${
              index === safeVacancies.length - 1 ? 'rounded-b-xl' : ''
            }`}
          >
            <div className="flex items-center gap-2 ml-[100px]">
              <div className="relative w-8 h-8">
                <div className="w-8 h-8 bg-[#D9D9D9] rounded-2xl flex items-center justify-center">
                  <Typography variant="body" weight="medium" className="text-primary font-lexend text-sm">
                    {row.initials}
                  </Typography>
                </div>
              </div>
              <div className="flex flex-col">
                <Typography variant="body" weight="medium" className="text-[#737373] font-lexend text-sm">
                  {row.name}
                </Typography>
                <Typography variant="body" weight="medium" className="text-[#737373] font-lexend text-sm">
                  {row.email}
                </Typography>
              </div>
            </div>
            <Typography variant="body" weight="medium" className="text-[#737373] absolute left-[440px] font-lexend text-sm">
              {row.caso}
            </Typography>
            <Typography variant="body" weight="medium" className="text-[#737373] absolute left-[585px] font-lexend text-sm">
              {row.status}
            </Typography>
            <Typography variant="body" weight="medium" className={`absolute left-[757px] font-lexend text-sm ${row.grauColor}`}>
              {row.grau}
            </Typography>
            <Typography variant="body" weight="medium" className="text-[#737373] absolute left-[956px] font-lexend text-sm">
              {row.diasAberto}
            </Typography>
            <Typography variant="body" weight="medium" className="text-[#737373] absolute left-[1132px] font-lexend text-sm">
              {row.convidados}
            </Typography>
            <Typography variant="body" weight="medium" className="text-[#737373] absolute left-[1280px] font-lexend text-sm">
              {row.postulados}
            </Typography>
            <Typography variant="body" weight="medium" className="text-[#737373] absolute left-[1435px] font-lexend text-sm">
              {row.selecionados}
            </Typography>
            <Typography variant="body" weight="medium" className="text-[#737373] absolute left-[1610px] font-lexend text-sm">
              {row.faltantes}
            </Typography>
            <img
              className="absolute left-0 w-6 h-6"
              alt="View"
              src="https://c.animaapp.com/UVSSEdVv/img/eye-6@2x.png"
            />
          </div>
          ))
        )}
      </div>
    </div>
  );
}
