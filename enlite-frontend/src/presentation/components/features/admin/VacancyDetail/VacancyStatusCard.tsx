import { Typography } from '@presentation/components/atoms/Typography';

interface VacancyStatusCardProps {
  status: string;
  country: string | null;
  createdAt: string | null;
  providersNeeded: number | null;
  caseNumber: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  BUSQUEDA:   'bg-blue-100 text-blue-700',
  REEMPLAZOS: 'bg-yellow-100 text-yellow-700',
  REEMPLAZO:  'bg-yellow-100 text-yellow-700',
  CERRADO:    'bg-gray-100 text-gray-600',
  ACTIVO:     'bg-green-100 text-green-700',
};

export function VacancyStatusCard({
  status,
  country,
  createdAt,
  providersNeeded,
  caseNumber,
}: VacancyStatusCardProps) {
  const colorClass = STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600';
  const startDate = createdAt ? new Date(createdAt).toLocaleDateString('pt-BR') : '—';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4">
      <Typography variant="h3" weight="semibold" className="text-[#737373]">
        Status da Vaga
      </Typography>
      <div className="flex flex-col gap-3">
        <div className="flex justify-between items-center">
          <Typography variant="body" className="text-[#737373]">Status</Typography>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${colorClass}`}>{status}</span>
        </div>
        {caseNumber && (
          <div className="flex justify-between">
            <Typography variant="body" className="text-[#737373]">Caso</Typography>
            <Typography variant="body" weight="medium">{caseNumber}</Typography>
          </div>
        )}
        <div className="flex justify-between">
          <Typography variant="body" className="text-[#737373]">País</Typography>
          <Typography variant="body" weight="medium">{country ?? '—'}</Typography>
        </div>
        <div className="flex justify-between">
          <Typography variant="body" className="text-[#737373]">Início da busca</Typography>
          <Typography variant="body" weight="medium">{startDate}</Typography>
        </div>
        <div className="flex justify-between">
          <Typography variant="body" className="text-[#737373]">Vagas necessárias</Typography>
          <Typography variant="body" weight="medium">{providersNeeded ?? '—'}</Typography>
        </div>
      </div>
    </div>
  );
}
