import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useJobStream } from '@hooks/useImportHistory';
import { 
  CheckCircle, 
  XCircle, 
  Loader2, 
  Ban, 
  Clock, 
  ArrowLeft,
  TerminalSquare
} from 'lucide-react';
import { Typography } from '@presentation/components/atoms';

interface Props {
  jobId: string;
  filename: string;
  onBack: () => void;
}

const ALL_PHASES = [
  { key: 'upload_received', label: 'Upload Receptado' },
  { key: 'parsing', label: 'Análisis de Archivo' },
  { key: 'importing', label: 'Importando Datos' },
  { key: 'post_processing', label: 'Procesamiento' },
  { key: 'linking', label: 'Vinculación' },
  { key: 'dedup', label: 'Deduplicación' },
];

export function ImportJobDetails({ jobId, filename, onBack }: Props) {
  const { t } = useTranslation();
  const streamState = useJobStream(jobId);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [streamState.logs.length]);

  const renderStatusIcon = (status: string) => {
    switch (status) {
      case 'done': return <CheckCircle className="w-6 h-6 text-green-500" />;
      case 'error': return <XCircle className="w-6 h-6 text-red-500" />;
      case 'processing': return <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />;
      case 'queued': return <Clock className="w-6 h-6 text-yellow-500 animate-pulse" />;
      case 'cancelled': return <Ban className="w-6 h-6 text-gray-400" />;
      default: return <Clock className="w-6 h-6 text-gray-300" />;
    }
  };

  const currentPhaseIndex = ALL_PHASES.findIndex(p => p.key === streamState.phase);
  const isTerminal = ['done', 'error', 'cancelled'].includes(streamState.status);

  return (
    <div className="flex flex-col h-full bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50/50">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            {renderStatusIcon(streamState.status)}
            <div>
              <Typography variant="h3" weight="semibold" className="text-gray-900 leading-tight">
                {filename}
              </Typography>
              <Typography variant="caption" className="text-gray-500">
                {streamState.status === 'queued' 
                  ? t('admin.imports.queuedPos', 'Posição na fila: {{pos}}', { pos: streamState.queuePosition || '-' })
                  : t('admin.imports.jobId', 'Job ID: {{id}}', { id: jobId.substring(0, 8) })
                }
              </Typography>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row flex-1 min-h-[500px] overflow-hidden">
        {/* Sidebar Steps */}
        <div className="w-full md:w-64 border-r border-gray-200 p-4 overflow-y-auto bg-gray-50/30">
          <Typography variant="body" weight="semibold" className="mb-4 text-gray-700">
            {t('admin.imports.pipeline', 'Pipeline')}
          </Typography>
          
          <div className="space-y-1 relative">
            {/* Linha vertical conectando os passos */}
            <div className="absolute left-[11px] top-4 bottom-4 w-px bg-gray-200 z-0"></div>

            {ALL_PHASES.map((phase, idx) => {
              let isPast = false;
              let isCurrent = false;

              if (streamState.status === 'done') {
                isPast = true;
              } else if (currentPhaseIndex > idx) {
                isPast = true;
              } else if (currentPhaseIndex === idx && !isTerminal) {
                isCurrent = true;
              }

              // Se erro ou cancelado na fase atual
              const isErrorHere = streamState.status === 'error' && currentPhaseIndex === idx;
              const isCancelledHere = streamState.status === 'cancelled' && currentPhaseIndex === idx;

              return (
                <div key={phase.key} className="flex flex-col relative z-10">
                  <div className="flex items-center gap-3 py-2 group">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 bg-white
                      ${isCurrent ? 'border-2 border-blue-500' : 'border border-gray-300'}
                      ${isPast ? 'bg-green-500 border-green-500' : ''}
                      ${isErrorHere ? 'bg-red-500 border-red-500' : ''}
                      ${isCancelledHere ? 'bg-gray-400 border-gray-400' : ''}
                    `}>
                      {isPast && <CheckCircle className="w-4 h-4 text-white" />}
                      {isCurrent && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                      {isErrorHere && <XCircle className="w-4 h-4 text-white" />}
                      {isCancelledHere && <Ban className="w-4 h-4 text-white" />}
                    </div>
                    <span className={`text-sm select-none
                      ${isCurrent ? 'font-medium text-blue-700' : 'text-gray-600'}
                      ${isPast ? 'text-gray-800' : ''}
                      ${isErrorHere ? 'text-red-600 font-medium' : ''}
                    `}>
                      {phase.label}
                    </span>
                  </div>
                  
                  {isCurrent && streamState.progress?.percent !== undefined && (
                    <div className="ml-9 pr-4 pb-2">
                       <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                        <div 
                          className="bg-blue-600 h-1.5 rounded-full transition-all duration-300" 
                          style={{ width: `${streamState.progress.percent}%` }}
                        ></div>
                      </div>
                      <div className="text-[10px] text-gray-500 mt-1">
                        {streamState.progress.processedRows && streamState.progress.totalRows 
                          ? `${streamState.progress.processedRows} / ${streamState.progress.totalRows} linhas` 
                          : `${streamState.progress.percent}%`}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Step final: DONE */}
            <div className="flex items-center gap-3 py-2 relative z-10 mt-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 bg-white
                ${streamState.status === 'done' ? 'bg-green-500 border-green-500' : 'border border-gray-300'}
              `}>
                {streamState.status === 'done' && <CheckCircle className="w-4 h-4 text-white" />}
              </div>
              <span className={`text-sm ${streamState.status === 'done' ? 'text-gray-800 font-medium' : 'text-gray-500'}`}>
                {t('common.done', 'Concluído')}
              </span>
            </div>
          </div>
          
          {/* Status extra messages */}
          {streamState.status === 'error' && (
            <div className="mt-6 p-3 bg-red-50 rounded-md border border-red-100">
              <Typography variant="caption" className="text-red-700 font-medium">Erro no processamento</Typography>
              <div title={streamState.error}>
                <Typography variant="caption" className="text-red-600 block mt-1 line-clamp-3">
                  {streamState.error}
                </Typography>
              </div>
            </div>
          )}
        </div>

        {/* Terminal Logs View */}
        <div className="flex-1 bg-gray-950 flex flex-col min-h-0">
          <div className="flex items-center p-3 border-b border-gray-800 bg-gray-900/50">
            <TerminalSquare className="w-4 h-4 text-gray-400 mr-2" />
            <Typography variant="caption" className="text-gray-300 font-mono">
              Logs
            </Typography>
          </div>
          <div className="flex-1 p-4 overflow-y-auto font-mono text-sm">
            {streamState.status === 'connecting' && streamState.logs.length === 0 && (
              <div className="text-gray-500 animate-pulse">Conectando ao stream de logs...</div>
            )}
            
            {streamState.logs.map((log, i) => (
              <div key={i} className="flex gap-3 hover:bg-gray-800/30 px-1 py-0.5 rounded">
                <span className="text-gray-600 flex-shrink-0 select-none">
                  {log.ts ? new Date(log.ts).toISOString().substr(11, 8) : ''}
                </span>
                <span className={`flex-shrink-0 w-12 select-none
                  ${log.level === 'INFO' ? 'text-blue-400' : ''}
                  ${log.level === 'WARN' ? 'text-yellow-400' : ''}
                  ${log.level === 'ERROR' ? 'text-red-400 font-bold' : ''}
                  ${log.level === 'DEBUG' ? 'text-gray-500' : ''}
                `}>
                  {log.level}
                </span>
                <span className={`text-gray-300 break-words ${log.level === 'ERROR' ? 'text-red-300' : ''}`}>
                  {log.message}
                </span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
