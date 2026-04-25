import { useTranslation } from 'react-i18next';
import { Plus, Search } from 'lucide-react';
import { Typography } from '@presentation/components/atoms/Typography';
import { Button } from '@presentation/components/atoms/Button';

/**
 * RelatoriosAtendimentosCard — Relatórios de Atendimentos.
 *
 * Table is always empty because there is no attendance_reports table yet.
 *
 * TODO: implement when attendance reports table is added.
 */
export function RelatoriosAtendimentosCard() {
  const { t } = useTranslation();

  return (
    <div className="bg-white rounded-card border-[1.5px] border-gray-700 p-6 sm:px-8 sm:py-10 flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Typography variant="h1" weight="semibold" as="h3">
          {t('admin.patients.detail.attendanceReportsCard.title')}
        </Typography>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled onClick={() => {}} className="w-28">
            {t('admin.patients.detail.edit')}
          </Button>
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
                {t('admin.patients.detail.attendanceReportsCard.tableDate')}
              </th>
              <th className="text-left px-3 py-2 font-medium">
                {t('admin.patients.detail.attendanceReportsCard.tableCheckIn')}
              </th>
              <th className="text-left px-3 py-2 font-medium">
                {t('admin.patients.detail.attendanceReportsCard.tableCheckOut')}
              </th>
              <th className="text-left px-3 py-2 font-medium">
                {t('admin.patients.detail.attendanceReportsCard.tableCaregiver')}
              </th>
              <th className="text-left px-3 py-2 font-medium">
                {t('admin.patients.detail.attendanceReportsCard.tableScore')}
              </th>
              <th className="text-left px-3 py-2 font-medium">
                {t('admin.patients.detail.attendanceReportsCard.tableStatus')}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={6} className="px-3 py-6 text-center">
                <Typography variant="body" className="text-[#737373]">
                  {t('admin.patients.detail.noData')}
                </Typography>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
