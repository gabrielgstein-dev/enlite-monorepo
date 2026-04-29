import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle, Loader2 } from 'lucide-react';
import { Typography } from '@presentation/components/atoms/Typography';
import { usePendingAddressReview } from '@hooks/admin/usePendingAddressReview';
import { ResolveAddressModal } from '@presentation/components/features/admin/VacancyAddressReview/ResolveAddressModal';
import type { ResolveAddressBody } from '@infrastructure/http/AdminVacancyAddressApiService';
import type { PendingAddressReviewItem } from '@domain/entities/PatientAddress';

// Badge for audit_match_type
function MatchTypeBadge({ type }: { type: PendingAddressReviewItem['audit_match_type'] }) {
  const { t } = useTranslation();
  const base = 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold';
  if (type === 'EXACT') return <span className={`${base} bg-green-100 text-green-700`}>{t('admin.pendingAddressReview.matchType.EXACT')}</span>;
  if (type === 'FUZZY') return <span className={`${base} bg-yellow-100 text-yellow-700`}>{t('admin.pendingAddressReview.matchType.FUZZY')}</span>;
  if (type === 'NONE') return <span className={`${base} bg-red-100 text-red-700`}>{t('admin.pendingAddressReview.matchType.NONE')}</span>;
  return <span className={`${base} bg-slate-100 text-slate-500`}>{t('admin.pendingAddressReview.matchType.unknown')}</span>;
}

export function PendingAddressReviewPage() {
  const { t } = useTranslation();
  const s = (k: string) => t(`admin.pendingAddressReview.${k}`);

  const { items, loading, error, activeItem, fetchItems, openReview, closeReview, resolve } =
    usePendingAddressReview();

  const [statusFilter, setStatusFilter] = useState('');
  const [resolving, setResolving] = useState(false);

  const handleFilterChange = (value: string) => {
    setStatusFilter(value);
    void fetchItems(value || undefined);
  };

  const handleResolve = async (body: ResolveAddressBody) => {
    setResolving(true);
    try {
      await resolve(body);
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <Typography variant="h2" weight="semibold" className="text-slate-800">
          {s('title')}
        </Typography>
        <Typography variant="body" className="text-slate-500 text-sm">
          {s('subtitle')}
        </Typography>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <span className="text-sm font-medium text-slate-600">
          {t('admin.pendingAddressReview.pendingCount', { count: items.length })}
        </span>
        <select
          value={statusFilter}
          onChange={e => handleFilterChange(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          aria-label={s('filterStatus.all')}
        >
          <option value="">{s('filterStatus.all')}</option>
          <option value="SEARCHING">{s('filterStatus.SEARCHING')}</option>
          <option value="SEARCHING_REPLACEMENT">{s('filterStatus.SEARCHING_REPLACEMENT')}</option>
          <option value="RAPID_RESPONSE">{s('filterStatus.RAPID_RESPONSE')}</option>
          <option value="CLOSED">{s('filterStatus.CLOSED')}</option>
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && items.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <CheckCircle className="w-12 h-12 text-green-500" />
          <Typography variant="h3" weight="semibold" className="text-slate-700">
            {s('noItems')}
          </Typography>
        </div>
      )}

      {/* Table */}
      {!loading && items.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">
                  {s('columns.case')}
                </th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">
                  {s('columns.patient')}
                </th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">
                  {s('columns.legacyAddress')}
                </th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">
                  {s('columns.matchAudit')}
                </th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">
                  {s('columns.status')}
                </th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">
                  {s('columns.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr
                  key={item.id}
                  className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                >
                  <td className="px-4 py-3 text-slate-800 font-medium whitespace-nowrap">
                    {item.title}
                  </td>
                  <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                    {item.patient_name}
                  </td>
                  <td className="px-4 py-3 text-slate-500 max-w-[200px] truncate">
                    {item.legacy_address_hint ?? '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <MatchTypeBadge type={item.audit_match_type} />
                    {item.audit_confidence_score !== null && (
                      <span className="ml-2 text-xs text-slate-400">
                        ({Math.round(item.audit_confidence_score * 100)}%)
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{item.status}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => openReview(item)}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors"
                    >
                      {s('resolve')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {activeItem && (
        <ResolveAddressModal
          item={activeItem}
          onConfirm={handleResolve}
          onClose={closeReview}
          isLoading={resolving}
        />
      )}
    </div>
  );
}
