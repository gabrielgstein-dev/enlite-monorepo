import { useTranslation } from 'react-i18next';
import { Typography } from '@presentation/components/atoms/Typography';
import type { WorkerServiceArea, WorkerLocation } from '@domain/entities/Worker';

interface WorkerLocationCardProps {
  serviceAreas: WorkerServiceArea[];
  location: WorkerLocation | null;
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between">
      <Typography variant="body" className="text-[#737373]">{label}</Typography>
      <Typography variant="body" weight="medium">{value ?? '—'}</Typography>
    </div>
  );
}

export function WorkerLocationCard({ serviceAreas, location }: WorkerLocationCardProps) {
  const { t } = useTranslation();

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4">
      <Typography variant="h3" weight="semibold" className="text-[#737373]">
        {t('admin.workerDetail.location')}
      </Typography>

      {/* Worker Location (Argentina) */}
      {location && (
        <div className="flex flex-col gap-3">
          <Field label={t('admin.workerDetail.address')} value={location.address} />
          <Field label={t('admin.workerDetail.city')} value={location.city} />
          <Field label={t('admin.workerDetail.workZone')} value={location.workZone} />
          <Field label={t('admin.workerDetail.interestZone')} value={location.interestZone} />
        </div>
      )}

      {/* Service Areas (Brazil) */}
      {serviceAreas.length > 0 && (
        <div className="flex flex-col gap-3">
          <Typography variant="body" weight="medium" className="text-[#737373]">
            {t('admin.workerDetail.serviceAreas')}
          </Typography>
          {serviceAreas.map((sa) => (
            <div key={sa.id} className="bg-slate-50 rounded-lg p-3 flex flex-col gap-1">
              <Typography variant="body" className="text-sm">
                {sa.address ?? '—'}
              </Typography>
              <Typography variant="body" className="text-xs text-[#737373]">
                {t('admin.workerDetail.radius')}: {sa.serviceRadiusKm ?? '—'} km
                {sa.lat != null && sa.lng != null && (
                  <span className="ml-2">({sa.lat.toFixed(4)}, {sa.lng.toFixed(4)})</span>
                )}
              </Typography>
            </div>
          ))}
        </div>
      )}

      {!location && serviceAreas.length === 0 && (
        <Typography variant="body" className="text-[#737373]">
          {t('admin.workerDetail.noLocation')}
        </Typography>
      )}
    </div>
  );
}
