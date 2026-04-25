import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Typography } from '@presentation/components/atoms/Typography';
import { Button } from '@presentation/components/atoms/Button';

/**
 * ProjetoTerapeuticoCard — Projeto/Plan Terapêutico.
 *
 * All fields display '—' because there is no backend table for therapeutic
 * projects yet. The version table shows an empty state.
 *
 * TODO: implement when therapeuticProjects table is added to the DB.
 */
export function ProjetoTerapeuticoCard() {
  const { t } = useTranslation();

  return (
    <div className="bg-white rounded-card border-[1.5px] border-gray-700 p-6 sm:px-8 sm:py-10 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Typography variant="h1" weight="semibold" as="h3">
          {t('admin.patients.detail.therapeuticProjectCard.title')}
        </Typography>
        <div className="flex items-center gap-2">
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
          <Button variant="outline" size="sm" disabled onClick={() => {}} className="w-28">
            {t('admin.patients.detail.edit')}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        {[
          'cid',
          'hypothesis',
          'currentClinicalContext',
          'generalObjective',
          'specificObjectives',
          'activitiesPlan',
          'symptoms',
          'observations',
          'deadlines',
          'pathologyTypes',
        ].map((key) => (
          <p key={key} className="font-lexend text-sm leading-snug">
            <span className="text-gray-800 font-medium">
              {t(`admin.patients.detail.therapeuticProjectCard.${key}`)}:{' '}
            </span>
            <span className="text-gray-700">—</span>
          </p>
        ))}
      </div>

      {/* Version history table */}
      <div className="mt-4">
        <Typography variant="body" weight="semibold" className="text-gray-800 mb-2">
          {t('admin.patients.detail.therapeuticProjectCard.tableVersion')}
        </Typography>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#EEEEEE] text-[#737373]">
                <th className="text-left px-3 py-2 font-medium">
                  {t('admin.patients.detail.therapeuticProjectCard.tableVersion')}
                </th>
                <th className="text-left px-3 py-2 font-medium">
                  {t('admin.patients.detail.therapeuticProjectCard.tableAuthor')}
                </th>
                <th className="text-left px-3 py-2 font-medium">
                  {t('admin.patients.detail.therapeuticProjectCard.tableStartDate')}
                </th>
                <th className="text-left px-3 py-2 font-medium">
                  {t('admin.patients.detail.therapeuticProjectCard.tableEndDate')}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center">
                  <Typography variant="body" className="text-[#737373]">
                    {t('admin.patients.detail.noData')}
                  </Typography>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
