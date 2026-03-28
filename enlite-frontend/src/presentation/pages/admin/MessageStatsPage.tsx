import { useTranslation } from 'react-i18next';
import {
  MessageSquare,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  AlertTriangle,
  Eye,
  PackageCheck,
} from 'lucide-react';
import { useMessageStats } from '@hooks/admin/useMessageStats';
import { Typography } from '@presentation/components/atoms/Typography';
import type { MessageError } from '../../../types/messaging';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface SummaryCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  colorClass: string;
  bgClass: string;
}

function SummaryCard({ label, value, icon, colorClass, bgClass }: SummaryCardProps): JSX.Element {
  return (
    <div className={`rounded-2xl border ${bgClass} px-6 py-5 flex items-center gap-4 shadow-sm`}>
      <div className={`${colorClass} shrink-0`}>{icon}</div>
      <div>
        <p className="text-[#737373] text-sm font-medium font-lexend">{label}</p>
        <p className={`text-3xl font-semibold font-poppins ${colorClass}`}>{value.toLocaleString('pt-BR')}</p>
      </div>
    </div>
  );
}

interface DeliveryRowProps {
  label: string;
  value: number;
  total: number;
  colorClass: string;
}

function DeliveryRow({ label, value, total, colorClass }: DeliveryRowProps): JSX.Element {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-4">
      <span className="w-36 text-sm text-[#737373] font-lexend shrink-0">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-2">
        <div
          className={`h-2 rounded-full ${colorClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-20 text-right text-sm font-semibold font-poppins text-[#484848]">
        {value.toLocaleString('pt-BR')} <span className="font-normal text-[#737373]">({pct}%)</span>
      </span>
    </div>
  );
}

interface ErrorsTableProps {
  errors: MessageError[];
}

function ErrorsTable({ errors }: ErrorsTableProps): JSX.Element {
  const { t } = useTranslation();

  if (errors.length === 0) {
    return (
      <div className="py-10 text-center text-[#737373] font-lexend text-sm">
        {t('admin.messaging.noErrors', 'Nenhum erro recente encontrado.')}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#D9D9D9]">
            <th className="text-left py-3 px-4 font-semibold text-[#737373] font-lexend">
              {t('admin.messaging.colDate', 'Data')}
            </th>
            <th className="text-left py-3 px-4 font-semibold text-[#737373] font-lexend">
              {t('admin.messaging.colPhone', 'Telefone')}
            </th>
            <th className="text-left py-3 px-4 font-semibold text-[#737373] font-lexend">
              {t('admin.messaging.colTemplate', 'Template')}
            </th>
            <th className="text-left py-3 px-4 font-semibold text-[#737373] font-lexend">
              {t('admin.messaging.colError', 'Erro')}
            </th>
          </tr>
        </thead>
        <tbody>
          {errors.map((err) => (
            <tr key={err.id} className="border-b border-[#F0F0F0] hover:bg-rose-50 transition-colors">
              <td className="py-3 px-4 text-[#484848] font-lexend whitespace-nowrap">
                {new Date(err.dispatchedAt).toLocaleString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </td>
              <td className="py-3 px-4 text-[#484848] font-lexend">{err.phone}</td>
              <td className="py-3 px-4">
                <span className="inline-block bg-purple-100 text-purple-700 rounded-full px-2 py-0.5 text-xs font-medium font-lexend">
                  {err.templateSlug}
                </span>
              </td>
              <td className="py-3 px-4 text-rose-600 font-lexend">{err.errorMessage}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function MessageStatsPage(): JSX.Element {
  const { t } = useTranslation();
  const { stats, isLoading, error, refetch } = useMessageStats();

  const dl = stats?.dispatchLogs;
  const ob = stats?.outbox;
  const ds = dl?.deliveryStatus;

  return (
    <div className="w-full min-h-screen bg-[#FFF9FC] px-4 sm:px-8 lg:px-[120px] py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <Typography variant="h1" weight="semibold" color="primary" className="font-poppins text-2xl">
          {t('admin.messaging.title', 'Mensagens')}
        </Typography>
        <button
          onClick={() => void refetch()}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[#D9D9D9] bg-white text-[#737373] text-sm font-medium font-lexend hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label={t('common.refresh', 'Atualizar')}
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          {t('common.refresh', 'Atualizar')}
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-6 flex items-center gap-3 bg-rose-50 border border-rose-200 rounded-2xl px-5 py-4">
          <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
          <p className="text-rose-700 text-sm font-lexend">{error}</p>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <SummaryCard
          label={t('admin.messaging.totalSent', 'Total Enviadas')}
          value={isLoading ? 0 : (dl?.total ?? 0)}
          icon={<MessageSquare className="w-8 h-8" />}
          colorClass="text-blue-600"
          bgClass="bg-blue-50 border-blue-100"
        />
        <SummaryCard
          label={t('admin.messaging.delivered', 'Entregues')}
          value={isLoading ? 0 : (ds?.delivered ?? 0)}
          icon={<CheckCircle className="w-8 h-8" />}
          colorClass="text-green-600"
          bgClass="bg-green-50 border-green-100"
        />
        <SummaryCard
          label={t('admin.messaging.withError', 'Com Erro')}
          value={isLoading ? 0 : (dl?.error ?? 0)}
          icon={<XCircle className="w-8 h-8" />}
          colorClass="text-red-600"
          bgClass="bg-red-50 border-red-100"
        />
        <SummaryCard
          label={t('admin.messaging.pending', 'Pendentes')}
          value={isLoading ? 0 : (ob?.pending ?? 0)}
          icon={<Clock className="w-8 h-8" />}
          colorClass="text-yellow-600"
          bgClass="bg-yellow-50 border-yellow-100"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Delivery status breakdown */}
        <div className="bg-white rounded-2xl border-2 border-[#D9D9D9] p-6">
          <div className="flex items-center gap-2 mb-5">
            <PackageCheck className="w-5 h-5 text-[#737373]" />
            <Typography variant="h2" weight="semibold" className="text-[#484848] font-poppins text-base">
              {t('admin.messaging.deliveryBreakdown', 'Status de Entrega')}
            </Typography>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 animate-pulse">
                  <div className="w-36 h-3 bg-gray-200 rounded" />
                  <div className="flex-1 h-2 bg-gray-200 rounded-full" />
                  <div className="w-20 h-3 bg-gray-200 rounded" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <DeliveryRow
                label={t('admin.messaging.statusDelivered', 'Entregue')}
                value={ds?.delivered ?? 0}
                total={dl?.sent ?? 1}
                colorClass="bg-green-500"
              />
              <DeliveryRow
                label={t('admin.messaging.statusRead', 'Lida')}
                value={ds?.read ?? 0}
                total={dl?.sent ?? 1}
                colorClass="bg-blue-500"
              />
              <DeliveryRow
                label={t('admin.messaging.statusUndelivered', 'Não Entregue')}
                value={ds?.undelivered ?? 0}
                total={dl?.sent ?? 1}
                colorClass="bg-orange-400"
              />
              <DeliveryRow
                label={t('admin.messaging.statusFailed', 'Falhou')}
                value={ds?.failed ?? 0}
                total={dl?.sent ?? 1}
                colorClass="bg-red-500"
              />
              <DeliveryRow
                label={t('admin.messaging.statusPending', 'Pendente')}
                value={ds?.pending ?? 0}
                total={dl?.sent ?? 1}
                colorClass="bg-yellow-400"
              />
            </div>
          )}
        </div>

        {/* Outbox summary */}
        <div className="bg-white rounded-2xl border-2 border-[#D9D9D9] p-6">
          <div className="flex items-center gap-2 mb-5">
            <Eye className="w-5 h-5 text-[#737373]" />
            <Typography variant="h2" weight="semibold" className="text-[#484848] font-poppins text-base">
              {t('admin.messaging.outboxSummary', 'Resumo da Fila (Outbox)')}
            </Typography>
          </div>

          {isLoading ? (
            <div className="space-y-3 animate-pulse">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex justify-between py-2">
                  <div className="w-24 h-4 bg-gray-200 rounded" />
                  <div className="w-16 h-4 bg-gray-200 rounded" />
                </div>
              ))}
            </div>
          ) : (
            <div className="divide-y divide-[#F0F0F0]">
              {[
                { label: t('admin.messaging.outboxTotal', 'Total na Fila'), value: ob?.total ?? 0, cls: 'text-[#484848]' },
                { label: t('admin.messaging.outboxSent', 'Enviadas'), value: ob?.sent ?? 0, cls: 'text-green-600' },
                { label: t('admin.messaging.outboxPending', 'Aguardando'), value: ob?.pending ?? 0, cls: 'text-yellow-600' },
                { label: t('admin.messaging.outboxFailed', 'Falharam'), value: ob?.failed ?? 0, cls: 'text-red-600' },
              ].map(({ label, value, cls }) => (
                <div key={label} className="flex items-center justify-between py-3">
                  <span className="text-sm text-[#737373] font-lexend">{label}</span>
                  <span className={`text-base font-semibold font-poppins ${cls}`}>
                    {value.toLocaleString('pt-BR')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent errors table */}
      <div className="bg-white rounded-2xl border-2 border-[#D9D9D9] p-6">
        <div className="flex items-center gap-2 mb-5">
          <AlertTriangle className="w-5 h-5 text-rose-500" />
          <Typography variant="h2" weight="semibold" className="text-[#484848] font-poppins text-base">
            {t('admin.messaging.recentErrors', 'Erros Recentes')}
          </Typography>
        </div>

        {isLoading ? (
          <div className="space-y-3 animate-pulse">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex gap-4 py-3 border-b border-[#F0F0F0]">
                <div className="w-32 h-4 bg-gray-200 rounded" />
                <div className="w-28 h-4 bg-gray-200 rounded" />
                <div className="w-40 h-4 bg-gray-200 rounded" />
                <div className="flex-1 h-4 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        ) : (
          <ErrorsTable errors={stats?.recentErrors ?? []} />
        )}
      </div>
    </div>
  );
}
