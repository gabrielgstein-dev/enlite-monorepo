import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  Loader2, 
  Ban, 
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useImportHistory, ImportJob } from '@hooks/useImportHistory';
import { Typography } from '@presentation/components/atoms';

interface Props {
  onSelectJob: (job: ImportJob) => void;
  refreshKey?: number;
}

export function ImportHistoryList({ onSelectJob, refreshKey }: Props) {
  const { t } = useTranslation();
  const { fetchHistory, fetchQueue, cancelJob } = useImportHistory();

  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false });
  const [loading, setLoading] = useState(true);
  const [queueInfo, setQueueInfo] = useState<{ running: any, queued: any[] } | null>(null);

  const StatusTabs = [
    { label: t('admin.imports.all', 'Todos'), value: '' },
    { label: t('admin.imports.inProgress', 'Em andamento'), value: 'processing' },
    { label: t('admin.imports.queued', 'Na fila'), value: 'queued' },
    { label: t('admin.imports.done', 'Concluído'), value: 'done' },
    { label: t('admin.imports.failed', 'Falhou'), value: 'error' },
    { label: t('admin.imports.cancelled', 'Cancelado'), value: 'cancelled' },
  ];

  const loadData = async () => {
    setLoading(true);
    try {
      const [historyRes, queueRes] = await Promise.all([
        fetchHistory(page, limit, statusFilter),
        fetchQueue()
      ]);
      setJobs(historyRes.data || []);
      setPagination(historyRes.pagination || { page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false });
      setQueueInfo(queueRes.data || null);
    } catch (err) {
      console.error('Failed to load import history', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, statusFilter, refreshKey]);

  // Bug 5 fix: derive shouldPoll outside the effect so the boolean is stable across
  // re-renders triggered by the interval's setJobs/setQueueInfo calls.
  // When jobs are still active, shouldPoll stays `true` → React skips the effect
  // (Object.is(true, true)) → the interval is NOT destroyed and recreated every 3s.
  const hasActiveJobs = jobs.some(j => j.status === 'processing' || j.status === 'queued');
  const hasActiveQueue = !!(queueInfo && (queueInfo.running || queueInfo.queued?.length > 0));
  const shouldPoll = hasActiveJobs || hasActiveQueue;

  useEffect(() => {
    if (!shouldPoll) return;

    const interval = setInterval(() => {
      fetchHistory(page, limit, statusFilter).then(res => {
        setJobs(res.data || []);
        setPagination(res.pagination || { page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false });
      });
      fetchQueue().then(res => setQueueInfo(res.data || null));
    }, 3000);

    return () => clearInterval(interval);
  }, [shouldPoll, page, limit, statusFilter, fetchHistory, fetchQueue]);

  const handleCancel = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm(t('admin.imports.confirmCancel', 'Tem certeza que deseja cancelar este import?'))) return;
    try {
      await cancelJob(id);
      loadData(); // refresh immediate
    } catch (err) {
      alert(t('admin.imports.cancelError', 'Erro ao cancelar o job.'));
    }
  };

  const renderStatusIcon = (status: string) => {
    switch (status) {
      case 'done': return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'error': return <XCircle className="w-5 h-5 text-red-600" />;
      case 'processing': return <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />;
      case 'queued': return <Clock className="w-5 h-5 text-yellow-600 animate-pulse" />;
      case 'cancelled': return <Ban className="w-5 h-5 text-gray-500" />;
      case 'pending':
      default: return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return t('admin.imports.justNow', 'agora mesmo');
    if (diffMins < 60) return t('admin.imports.minsAgo', 'há {{count}} min', { count: diffMins });
    if (diffMins < 1440) return t('admin.imports.hoursAgo', 'há {{count}}h', { count: Math.floor(diffMins / 60) });
    
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
  };

  return (
    <div className="flex flex-col border border-gray-200 rounded-lg bg-white overflow-hidden shadow-sm">
      {/* Header and Queue Info */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center p-4 border-b border-gray-200 bg-gray-50/50">
        <div>
          <Typography variant="h3" weight="semibold" className="text-gray-900">
            {t('admin.imports.historyTitle', 'Histórico de Imports')}
          </Typography>
          {queueInfo && (queueInfo.running || queueInfo.queued?.length > 0) && (
            <Typography variant="caption" className="text-gray-500 mt-1 flex items-center gap-1">
              <span className="relative flex h-2 w-2 mr-1">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
              {queueInfo.running ? '1 em andamento' : '0 em andamento'}
              {' · '}
              {queueInfo.queued.length} na fila
            </Typography>
          )}
        </div>
      </div>

      {/* Filters (GitHub style tabs) */}
      <div className="flex overflow-x-auto border-b border-gray-200 px-4 pt-2 no-scrollbar">
        <div className="flex space-x-6">
          {StatusTabs.map(tab => (
            <button
              key={tab.value}
              onClick={() => { setPage(1); setStatusFilter(tab.value); }}
              className={`pb-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
                statusFilter === tab.value
                  ? 'border-blue-600 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table List */}
      <div className="overflow-x-auto min-h-[400px]">
        {loading && jobs.length === 0 ? (
          <div className="flex justify-center items-center h-48">
             <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-500">
            <Typography variant="body" color="secondary">
              {t('admin.imports.noJobs', 'Nenhum import encontrado com estes filtros.')}
            </Typography>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <tbody className="bg-white divide-y divide-gray-100">
              {jobs.map(job => (
                <tr 
                  key={job.id} 
                  onClick={() => onSelectJob(job)}
                  className="hover:bg-gray-50 cursor-pointer group transition-colors"
                >
                  <td className="px-4 py-4 whitespace-nowrap w-8">
                    {renderStatusIcon(job.status)}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap max-w-sm w-full">
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-gray-900 group-hover:text-blue-600 transition-colors truncate">
                        {job.filename}
                      </span>
                      <span className="text-xs text-gray-500 flex items-center gap-2 mt-1 truncate">
                        <span className="font-medium bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">
                          {job.currentPhase || job.status}
                        </span>
                        <span>·</span>
                        <span>{job.createdBy}</span>
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                    {formatDate(job.createdAt)}
                    {job.duration && <span className="ml-2 text-gray-400">({job.duration})</span>}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-right w-16">
                    {(job.status === 'queued' || job.status === 'processing') ? (
                      <button 
                        onClick={(e) => handleCancel(e, job.id)}
                        className="text-gray-400 hover:text-red-600 p-1 rounded-full hover:bg-red-50 transition-colors"
                        title={t('admin.imports.cancelAction', 'Cancelar importação')}
                      >
                        <XCircle className="w-5 h-5" />
                      </button>
                    ) : (
                      <div className="w-7 h-7" /> // placeholder
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-200 sm:px-6">
        <div className="flex justify-between flex-1 sm:hidden">
          <button
            onClick={() => setPage(p => p - 1)}
            disabled={!pagination.hasPrev}
            className="relative inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            {t('common.previous', 'Anterior')}
          </button>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={!pagination.hasNext}
            className="relative inline-flex items-center px-4 py-2 ml-3 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            {t('common.next', 'Próxima')}
          </button>
        </div>
        <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-gray-700">
              {t('admin.imports.showingCount', 'Mostrando')} <span className="font-medium">{jobs.length}</span>{' '}
              {t('admin.imports.of', 'de')} <span className="font-medium">{pagination.total}</span>{' '}
              {t('admin.imports.results', 'runs')}
            </p>
          </div>
          <div>
            <nav className="relative z-0 inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
              <button
                onClick={() => setPage(p => p - 1)}
                disabled={!pagination.hasPrev}
                className="relative inline-flex items-center px-2 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-l-md hover:bg-gray-50 disabled:opacity-50"
              >
                <span className="sr-only">Previous</span>
                <ChevronLeft className="w-5 h-5" aria-hidden="true" />
              </button>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={!pagination.hasNext}
                className="relative inline-flex items-center px-2 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-r-md hover:bg-gray-50 disabled:opacity-50"
              >
                <span className="sr-only">Next</span>
                <ChevronRight className="w-5 h-5" aria-hidden="true" />
              </button>
            </nav>
          </div>
        </div>
      </div>
    </div>
  );
}
