import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Typography } from '@presentation/components/atoms/Typography';
import { Button } from '@presentation/components/atoms/Button';
import type { PatientDetail } from '@domain/entities/PatientDetail';

interface ServicosContratadosCardProps {
  patient: PatientDetail;
}

/**
 * "Serviços Contratados" — full table no Figma com Dispositivo/Profissional/
 * Quant/Local/Sexo/Valor/Versão. O schema atual não tem essa tabela; a única
 * coisa relacionada é `patient.serviceType[]`. Renderizamos um row sintético
 * por serviceType (Dispositivo = deviceType, Profissional = serviceType raw)
 * para dar contexto. Demais colunas aparecem como '—' até que o schema seja
 * estendido (Phase 2 + nova migration).
 */
export function ServicosContratadosCard({ patient }: ServicosContratadosCardProps) {
  const { t } = useTranslation();
  const empty = '—';
  const services = patient.serviceType ?? [];

  return (
    <div
      className="bg-white rounded-card border-[1.5px] border-gray-700 p-6 sm:px-8 sm:py-10 flex flex-col gap-4"
      data-testid="servicos-contratados-card"
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Typography variant="h1" weight="semibold" as="h3">
          {t('admin.patients.detail.contractedServicesCard.title')}
        </Typography>
        <Button
          variant="outline"
          size="sm"
          disabled
          onClick={() => {}}
          className="flex items-center gap-1"
        >
          <Plus className="w-4 h-4" />
          {t('admin.patients.detail.new')}
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#EEEEEE] text-[#737373]">
              <th className="text-left px-3 py-2 font-medium">
                {t('admin.patients.detail.contractedServicesCard.tableDevice')}
              </th>
              <th className="text-left px-3 py-2 font-medium">
                {t('admin.patients.detail.contractedServicesCard.tableProfessional')}
              </th>
              <th className="text-left px-3 py-2 font-medium">
                {t('admin.patients.detail.contractedServicesCard.tableQuantity')}
              </th>
              <th className="text-left px-3 py-2 font-medium">
                {t('admin.patients.detail.contractedServicesCard.tableLocation')}
              </th>
              <th className="text-left px-3 py-2 font-medium">
                {t('admin.patients.detail.contractedServicesCard.tableSex')}
              </th>
              <th className="text-left px-3 py-2 font-medium">
                {t('admin.patients.detail.contractedServicesCard.tableValue')}
              </th>
              <th className="text-left px-3 py-2 font-medium">
                {t('admin.patients.detail.contractedServicesCard.tableVersion')}
              </th>
            </tr>
          </thead>
          <tbody>
            {services.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center">
                  <Typography variant="body" className="text-[#737373]">
                    {t('admin.patients.detail.noData')}
                  </Typography>
                </td>
              </tr>
            ) : (
              services.map((svc) => (
                <tr key={svc} className="border-b border-[#D9D9D9] last:border-0">
                  <td className="px-3 py-3">{patient.deviceType ?? empty}</td>
                  <td className="px-3 py-3">
                    {t(`admin.patients.detail.contractedServicesCard.serviceTypes.${svc}`, svc)}
                  </td>
                  <td className="px-3 py-3">{empty}</td>
                  <td className="px-3 py-3">{empty}</td>
                  <td className="px-3 py-3">{empty}</td>
                  <td className="px-3 py-3">{empty}</td>
                  <td className="px-3 py-3">{empty}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
