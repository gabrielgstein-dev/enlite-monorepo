import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Typography } from '@presentation/components/atoms/Typography';
import type { WorkerEncuadre } from '@domain/entities/Worker';

interface WorkerEncuadresCardProps {
  encuadres: WorkerEncuadre[];
}

const RESULTADO_COLORS: Record<string, string> = {
  SELECCIONADO: 'bg-green-100 text-green-700',
  RECHAZADO: 'bg-red-100 text-red-700',
  AT_NO_ACEPTA: 'bg-orange-100 text-orange-700',
  PENDIENTE: 'bg-yellow-100 text-yellow-700',
  REPROGRAMAR: 'bg-blue-100 text-blue-700',
  REEMPLAZO: 'bg-purple-100 text-purple-700',
  BLACKLIST: 'bg-gray-800 text-white',
};

export function WorkerEncuadresCard({ encuadres }: WorkerEncuadresCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="bg-white rounded-card border-2 border-gray-600 p-6 sm:px-8 sm:py-10 flex flex-col gap-4">
      <Typography variant="h1" weight="semibold" as="h3" className="text-[#737373]">
        {t('admin.workerDetail.encuadres')} ({encuadres.length})
      </Typography>

      {encuadres.length === 0 ? (
        <Typography variant="body" className="text-[#737373]">
          {t('admin.workerDetail.noEncuadres')}
        </Typography>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#EEEEEE] text-[#737373]">
                <th className="text-left px-3 py-2 font-medium rounded-tl-lg">
                  {t('admin.workerDetail.case')}
                </th>
                <th className="text-left px-3 py-2 font-medium">
                  {t('admin.workerDetail.patient')}
                </th>
                <th className="text-left px-3 py-2 font-medium">
                  {t('admin.workerDetail.result')}
                </th>
                <th className="text-left px-3 py-2 font-medium">
                  {t('admin.workerDetail.interview')}
                </th>
                <th className="text-left px-3 py-2 font-medium">
                  {t('admin.workerDetail.recruiter')}
                </th>
                <th className="text-left px-3 py-2 font-medium rounded-tr-lg">
                  {t('admin.workerDetail.date')}
                </th>
              </tr>
            </thead>
            <tbody>
              {encuadres.map((e) => {
                const resultColor = RESULTADO_COLORS[e.resultado ?? ''] ?? 'bg-gray-100 text-gray-600';
                const interviewDisplay = e.interviewDate
                  ? `${new Date(e.interviewDate).toLocaleDateString('pt-BR')}${e.interviewTime ? ` ${e.interviewTime}` : ''}`
                  : '—';

                return (
                  <tr
                    key={e.id}
                    className="border-b border-[#D9D9D9] last:border-0 hover:bg-slate-50 cursor-pointer"
                    onClick={() => e.jobPostingId && navigate(`/admin/vacancies/${e.jobPostingId}`)}
                  >
                    <td className="px-3 py-2 font-medium">
                      {e.caseNumber ?? '—'}
                    </td>
                    <td className="px-3 py-2">{e.patientName ?? '—'}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${resultColor}`}>
                        {e.resultado ?? '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2">{interviewDisplay}</td>
                    <td className="px-3 py-2">{e.recruiterName ?? '—'}</td>
                    <td className="px-3 py-2">
                      {new Date(e.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
