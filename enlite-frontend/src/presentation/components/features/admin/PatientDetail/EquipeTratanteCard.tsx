import { useTranslation } from 'react-i18next';
import { Plus, Search } from 'lucide-react';
import { Typography } from '@presentation/components/atoms/Typography';
import { Button } from '@presentation/components/atoms/Button';
import type { PatientProfessionalDetail } from '@domain/entities/PatientDetail';

interface EquipeTratanteCardProps {
  professionals: PatientProfessionalDetail[];
}

export function EquipeTratanteCard({ professionals }: EquipeTratanteCardProps) {
  const { t } = useTranslation();
  const safeProfessionals = professionals ?? [];

  return (
    <div className="bg-white rounded-card border-[1.5px] border-gray-700 p-6 sm:px-8 sm:py-10 flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Typography variant="h1" weight="semibold" as="h3">
          {t('admin.patients.detail.treatingTeamCard.title')}
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

      {/* Search bar — UI only */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
        <input
          type="text"
          readOnly
          placeholder={t('admin.patients.detail.searchPlaceholder')}
          className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm font-lexend text-gray-700 bg-gray-50 cursor-default outline-none"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#EEEEEE] text-[#737373]">
              <th className="text-left px-3 py-2 font-medium">
                {t('admin.patients.detail.treatingTeamCard.tableFullName')}
              </th>
              <th className="text-left px-3 py-2 font-medium">
                {t('admin.patients.detail.treatingTeamCard.tablePhoneNumber')}
              </th>
              <th className="text-left px-3 py-2 font-medium">
                {t('admin.patients.detail.treatingTeamCard.tableProfile')}
              </th>
            </tr>
          </thead>
          <tbody>
            {safeProfessionals.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center">
                  <Typography variant="body" className="text-[#737373]">
                    {t('admin.patients.detail.noData')}
                  </Typography>
                </td>
              </tr>
            ) : (
              safeProfessionals.map((prof) => (
                <tr key={prof.id} className="border-b border-[#D9D9D9] last:border-0">
                  <td className="px-3 py-2">{prof.fullName ?? '—'}</td>
                  <td className="px-3 py-2">{prof.phone ?? '—'}</td>
                  <td className="px-3 py-2">{prof.specialty ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
