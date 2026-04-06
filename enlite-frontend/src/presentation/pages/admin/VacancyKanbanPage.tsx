import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Typography } from '@presentation/components/atoms/Typography';
import { Button } from '@presentation/components/atoms/Button';
import { KanbanBoard } from '@presentation/components/features/admin/Kanban/KanbanBoard';
import { useEncuadreFunnel } from '@hooks/admin/useEncuadreFunnel';
import { useVacancyDetail } from '@hooks/admin/useVacancyDetail';

export default function VacancyKanbanPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { vacancy } = useVacancyDetail(id);
  const { data, isLoading, error, refetch, moveEncuadre } = useEncuadreFunnel(id);

  const title = vacancy?.case_number != null && vacancy?.vacancy_number != null
    ? `Caso ${vacancy.case_number}-${vacancy.vacancy_number}`
    : vacancy?.case_number != null
      ? `Caso ${vacancy.case_number}`
      : vacancy?.title ?? 'Vacante';

  return (
    <div className="w-full min-h-screen bg-[#FFF9FC] px-4 sm:px-8 lg:px-[60px] py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/admin/vacancies/${id}`)} className="text-[#180149] hover:opacity-70">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <Typography variant="h2" weight="semibold" color="primary" className="font-poppins">
              Kanban — {title}
            </Typography>
            {data && (
              <Typography variant="caption" className="text-slate-500">
                {data.totalEncuadres} encuadres totales
              </Typography>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={refetch} disabled={isLoading}>
          <RefreshCw className={`w-4 h-4 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
          <Typography variant="body" className="text-red-700">{error}</Typography>
        </div>
      )}

      {/* Loading */}
      {isLoading && !data && (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
        </div>
      )}

      {/* Board */}
      {data?.stages && (
        <KanbanBoard stages={data.stages} onMove={moveEncuadre} />
      )}
    </div>
  );
}
