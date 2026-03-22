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
}

const TABLE_HEADERS = [
  { label: 'NOME', ml: 'ml-24', width: 'w-[50px]' },
  { label: 'CASO', ml: 'ml-[290px]', width: 'w-[45px]' },
  { label: 'STATUS', ml: 'ml-[71px]', width: 'w-[61px]' },
  { label: 'GRAU DE DEPENDÊNCIA', ml: 'ml-[111px]', width: 'w-[199px]' },
  { label: 'DIAS EM ABERTO', ml: 'ml-[29px]', width: 'w-[140px]' },
  { label: 'CONVIDADOS', ml: 'ml-9', width: 'w-[114px]' },
  { label: 'POSTULADOS', ml: 'ml-[34px]', width: 'w-[111px]' },
  { label: 'SELECIONADOS', ml: 'ml-[37px]', width: 'w-[130px]' },
  { label: 'FALTANTES', ml: 'ml-[42px]', width: 'w-[91px]' },
];

export function VacanciesTable({ vacancies }: VacanciesTableProps): JSX.Element {
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
            {header.label}
          </Typography>
        ))}
      </div>

      {/* Table Rows */}
      <div className="flex flex-col w-full">
        {vacancies.map((row, index) => (
          <div
            key={row.id}
            className={`relative w-full h-[72px] bg-white border border-[#ECEFF1] flex items-center ${
              index === vacancies.length - 1 ? 'rounded-b-xl' : ''
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
            <img
              className="absolute left-0 w-6 h-6"
              alt="View"
              src="https://c.animaapp.com/UVSSEdVv/img/eye-6@2x.png"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
