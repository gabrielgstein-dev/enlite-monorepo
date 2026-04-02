import { useTranslation } from 'react-i18next';
import { Typography } from '@presentation/components/atoms/Typography';
import { Button } from '@presentation/components/atoms/Button';
import type { WorkerServiceArea, WorkerLocation } from '@domain/entities/Worker';

interface WorkerAddressCardProps {
  serviceAreas: WorkerServiceArea[];
  location: WorkerLocation | null;
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <p className="font-lexend text-sm leading-snug">
      <span className="text-gray-800 font-medium">{label} </span>
      <span className="text-gray-700">{value ?? '—'}</span>
    </p>
  );
}

export function WorkerAddressCard({ serviceAreas, location }: WorkerAddressCardProps) {
  const { t } = useTranslation();

  const hasData = location || serviceAreas.length > 0;

  return (
    <div className="bg-white rounded-card border-2 border-gray-600 p-6 sm:px-8 sm:py-10 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <Typography variant="h3" weight="semibold" className="text-gray-800">
          {t('admin.workerDetail.addressData')}
        </Typography>
        <Button variant="primary" size="sm" className="w-40 shrink-0">
          {t('admin.workerDetail.edit')}
        </Button>
      </div>

      {!hasData && (
        <Typography variant="body" className="text-gray-700">
          {t('admin.workerDetail.noLocation')}
        </Typography>
      )}

      {/* Argentina location */}
      {location && (
        <div className="flex flex-col sm:flex-row gap-8">
          <div className="flex flex-col gap-3">
            <Field label={`${t('admin.workerDetail.address')}:`} value={location.address} />
            <Field label={`${t('admin.workerDetail.city')}:`} value={location.city} />
            <Field label={`${t('admin.workerDetail.workZone')}:`} value={location.workZone} />
            <Field label={`${t('admin.workerDetail.interestZone')}:`} value={location.interestZone} />
          </div>
        </div>
      )}

      {/* Brazil service areas */}
      {serviceAreas.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-8">
          <div className="flex flex-col gap-3 flex-1">
            {serviceAreas.map((sa) => (
              <div key={sa.id} className="flex flex-col gap-1">
                <Field label={`${t('admin.workerDetail.address')}:`} value={sa.address} />
                {sa.serviceRadiusKm != null && (
                  <Field label={`${t('admin.workerDetail.serviceRadius')}:`} value={`${sa.serviceRadiusKm}km`} />
                )}
              </div>
            ))}
          </div>

          {/* Map placeholder - service area visualization */}
          {serviceAreas[0]?.lat != null && serviceAreas[0]?.lng != null && (
            <div className="flex flex-col gap-2 shrink-0">
              <p className="font-lexend text-sm leading-snug">
                <span className="text-gray-800 font-medium">{t('admin.workerDetail.serviceRadius')}: </span>
                <span className="text-gray-700">{serviceAreas[0].serviceRadiusKm ?? '—'}km</span>
              </p>
              <div className="w-full sm:w-[408px] h-[109px] bg-gray-300 rounded-lg flex items-center justify-center relative overflow-hidden">
                <div className="w-24 h-24 rounded-full border-2 border-coordination bg-coordination/20" />
                <span className="absolute bottom-2 right-2 text-xs text-gray-800 font-lexend">
                  ({serviceAreas[0].lat.toFixed(4)}, {serviceAreas[0].lng.toFixed(4)})
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
