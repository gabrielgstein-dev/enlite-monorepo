import { useNavigate } from 'react-router-dom';
import { Typography } from '@presentation/components/atoms/Typography';
import { Button } from '@presentation/components/atoms/Button';
import { RefreshCw, AlertTriangle, Users, Clock, TrendingUp } from 'lucide-react';
import { useCoordinatorDashboard } from '@hooks/admin/useCoordinatorDashboard';
import type { CoordinatorMetrics, DashboardAlert } from '@hooks/admin/useCoordinatorDashboard';

const ALERT_LABELS: Record<string, string> = {
  MORE_THAN_200_ENCUADRES: '+200 encuadres sin éxito',
  OPEN_MORE_THAN_30_DAYS: 'Abierto +30 días',
  NO_CANDIDATES_LAST_7_DAYS: 'Sin candidatos (7d)',
};

function CoordinatorCard({ c }: { c: CoordinatorMetrics }) {
  const conversionPct = c.conversionRate !== null
    ? `${(c.conversionRate * 100).toFixed(0)}%`
    : '—';

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
      <Typography variant="body" weight="semibold" className="text-[#180149] mb-3">
        {c.name}
      </Typography>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-slate-400" />
          <div>
            <span className="text-xs text-slate-500">Horas/sem</span>
            <p className="text-sm font-semibold text-[#180149]">{c.weeklyHours ?? '—'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-slate-400" />
          <div>
            <span className="text-xs text-slate-500">Casos activos</span>
            <p className="text-sm font-semibold text-[#180149]">{c.activeCases}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-slate-400" />
          <div>
            <span className="text-xs text-slate-500">Conversión</span>
            <p className="text-sm font-semibold text-[#180149]">{conversionPct}</p>
          </div>
        </div>
        <div>
          <span className="text-xs text-slate-500">Encuadres (sem)</span>
          <p className="text-sm font-semibold text-[#180149]">{c.encuadresThisWeek}</p>
        </div>
      </div>
    </div>
  );
}

function AlertCard({ alert, onNavigate }: { alert: DashboardAlert; onNavigate: (id: string) => void }) {
  return (
    <div
      className="bg-white rounded-xl border border-red-200 p-4 shadow-sm cursor-pointer hover:border-red-300 transition-colors"
      onClick={() => onNavigate(alert.jobPostingId)}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <Typography variant="body" weight="semibold" className="text-[#180149]">
            {alert.caseNumber ? `Caso ${alert.caseNumber}` : alert.title ?? 'Sin título'}
          </Typography>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {alert.alertReasons.map((reason) => (
              <span key={reason} className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-50 text-red-600">
                {ALERT_LABELS[reason] ?? reason}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
            {alert.coordinatorName && <span>Coord: {alert.coordinatorName}</span>}
            {alert.daysOpen !== null && <span>{alert.daysOpen}d abierto</span>}
            <span>{alert.totalEncuadres} encuadres</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CoordinatorDashboardPage() {
  const navigate = useNavigate();
  const { coordinators, alerts, channels, isLoading, error, refetch } = useCoordinatorDashboard();

  return (
    <div className="w-full min-h-screen bg-[#FFF9FC] px-4 sm:px-8 lg:px-[120px] py-8">
      <div className="flex items-center justify-between mb-8">
        <Typography variant="h1" weight="semibold" color="primary" className="font-poppins text-2xl">
          Dashboard Coordinadores
        </Typography>
        <Button variant="outline" size="sm" onClick={refetch} disabled={isLoading}>
          <RefreshCw className={`w-4 h-4 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <Typography variant="body" className="text-red-700">{error}</Typography>
        </div>
      )}

      {isLoading && coordinators.length === 0 && (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
        </div>
      )}

      {/* Alerts Section */}
      {alerts.length > 0 && (
        <div className="mb-8">
          <Typography variant="h3" weight="semibold" className="text-[#180149] mb-4">
            Casos problemáticos ({alerts.length})
          </Typography>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {alerts.map((alert) => (
              <AlertCard
                key={alert.jobPostingId}
                alert={alert}
                onNavigate={(id) => navigate(`/admin/vacancies/${id}/kanban`)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Conversion by Channel */}
      {channels.length > 0 && (
        <div className="mb-8">
          <Typography variant="h3" weight="semibold" className="text-[#180149] mb-4">
            Conversión por canal de origen
          </Typography>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-2.5 text-sm font-semibold text-[#180149]">Canal</th>
                  <th className="text-right px-4 py-2.5 text-sm font-semibold text-[#180149]">Total</th>
                  <th className="text-right px-4 py-2.5 text-sm font-semibold text-[#180149]">Asistieron</th>
                  <th className="text-right px-4 py-2.5 text-sm font-semibold text-[#180149]">Seleccionados</th>
                  <th className="text-right px-4 py-2.5 text-sm font-semibold text-[#180149]">Conversión</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {channels.map((ch) => (
                  <tr key={ch.channel} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-sm font-medium text-[#180149]">{ch.channel}</td>
                    <td className="px-4 py-2.5 text-sm text-right text-slate-600">{ch.total}</td>
                    <td className="px-4 py-2.5 text-sm text-right text-slate-600">{ch.attended}</td>
                    <td className="px-4 py-2.5 text-sm text-right text-slate-600">{ch.selected}</td>
                    <td className="px-4 py-2.5 text-sm text-right font-semibold text-[#180149]">
                      {ch.conversionRate !== null ? `${(ch.conversionRate * 100).toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Coordinator Cards */}
      {coordinators.length > 0 && (
        <div>
          <Typography variant="h3" weight="semibold" className="text-[#180149] mb-4">
            Capacidad por coordinador ({coordinators.length})
          </Typography>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {coordinators.map((c) => (
              <CoordinatorCard key={c.id} c={c} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
