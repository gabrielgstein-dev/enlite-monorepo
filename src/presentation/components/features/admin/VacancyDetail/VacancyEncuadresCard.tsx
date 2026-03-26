import { Typography } from '@presentation/components/atoms/Typography';

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

export function VacancyEncuadresCard({ encuadres }: VacancyEncuadresCardProps) {
  const safeEncuadres = encuadres ?? [];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4">
      <Typography variant="h3" weight="semibold" className="text-[#737373]">
        Encuadres recentes
      </Typography>
      {safeEncuadres.length === 0 ? (
        <Typography variant="body" className="text-[#737373]">Nenhum encuadre registrado.</Typography>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#EEEEEE] text-[#737373]">
                <th className="text-left px-3 py-2 font-medium rounded-tl-lg">Worker</th>
                <th className="text-left px-3 py-2 font-medium">Data</th>
                <th className="text-left px-3 py-2 font-medium">Resultado</th>
                <th className="text-left px-3 py-2 font-medium rounded-tr-lg">Presente</th>
              </tr>
            </thead>
            <tbody>
              {safeEncuadres.map((e) => (
                <tr key={e.id} className="border-b border-[#D9D9D9] last:border-0">
                  <td className="px-3 py-2">{e.worker_name ?? '—'}</td>
                  <td className="px-3 py-2">
                    {e.interview_date
                      ? new Date(e.interview_date).toLocaleDateString('pt-BR')
                      : '—'}
                  </td>
                  <td className="px-3 py-2">{e.resultado ?? '—'}</td>
                  <td className="px-3 py-2">
                    {e.attended === null ? '—' : e.attended ? 'Sim' : 'Não'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
