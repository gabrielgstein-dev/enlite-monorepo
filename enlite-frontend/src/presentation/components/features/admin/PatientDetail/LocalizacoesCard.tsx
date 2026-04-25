import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Typography } from '@presentation/components/atoms/Typography';
import { Button } from '@presentation/components/atoms/Button';
import type { PatientAddressDetail } from '@domain/entities/PatientDetail';

interface LocalizacoesCardProps {
  addresses: PatientAddressDetail[];
}

export function LocalizacoesCard({ addresses }: LocalizacoesCardProps) {
  const { t } = useTranslation();
  const rows = addresses ?? [];
  const empty = '—';

  return (
    <div
      className="bg-white rounded-card border-[1.5px] border-gray-700 p-6 sm:px-8 sm:py-10 flex flex-col gap-4"
      data-testid="localizacoes-card"
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Typography variant="h1" weight="semibold" as="h3">
          {t('admin.patients.detail.locationsCard.title')}
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
                {t('admin.patients.detail.locationsCard.tableName')}
              </th>
              <th className="text-left px-3 py-2 font-medium">
                {t('admin.patients.detail.locationsCard.tableAddress')}
              </th>
              <th className="text-left px-3 py-2 font-medium">
                {t('admin.patients.detail.locationsCard.tableNote')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center">
                  <Typography variant="body" className="text-[#737373]">
                    {t('admin.patients.detail.noData')}
                  </Typography>
                </td>
              </tr>
            ) : (
              rows.map((addr, idx) => (
                <tr key={addr.id} className="border-b border-[#D9D9D9] last:border-0 align-top">
                  <td className="px-3 py-3">
                    {/* TODO: nameLabel column does not exist; show generic placeholder by index. */}
                    {t('admin.patients.detail.locationsCard.addressGeneric', {
                      index: idx + 1,
                      defaultValue: `Endereço ${idx + 1}`,
                    })}
                  </td>
                  <td className="px-3 py-3">
                    {addr.fullAddress
                      ?? ([addr.street, addr.number, addr.city, addr.state]
                          .filter(Boolean)
                          .join(', ') || empty)}
                  </td>
                  <td className="px-3 py-3 text-gray-600">
                    {addr.complement ?? empty}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
