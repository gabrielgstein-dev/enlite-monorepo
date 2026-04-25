import { useTranslation } from 'react-i18next';
import { Plus, Search } from 'lucide-react';
import { Typography } from '@presentation/components/atoms/Typography';
import { Button } from '@presentation/components/atoms/Button';
import type { PatientResponsibleDetail } from '@domain/entities/PatientDetail';

interface FamiliaresCardProps {
  responsibles: PatientResponsibleDetail[];
}

function formatRelationship(value: string | null, fallback: string): string {
  if (!value) return fallback;
  // Backend stores canonical UPPERCASE_EN values (e.g. "SISTER", "FATHER"); the
  // i18n layer maps them. If a key is missing we fall back to the raw value.
  return value;
}

export function FamiliaresCard({ responsibles }: FamiliaresCardProps) {
  const { t } = useTranslation();
  const rows = responsibles ?? [];
  const empty = '—';

  return (
    <div
      className="bg-white rounded-card border-[1.5px] border-gray-700 p-6 sm:px-8 sm:py-10 flex flex-col gap-4"
      data-testid="familiares-card"
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Typography variant="h1" weight="semibold" as="h3">
          {t('admin.patients.detail.familyCard.title')}
        </Typography>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
            <input
              type="text"
              readOnly
              placeholder={t('admin.patients.detail.searchPlaceholder')}
              className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm font-lexend text-gray-700 bg-gray-50 cursor-default outline-none"
            />
          </div>
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

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#EEEEEE] text-[#737373]">
              <th className="text-left px-3 py-2 font-medium">
                {t('admin.patients.detail.familyCard.tableRelationship')}
              </th>
              <th className="text-left px-3 py-2 font-medium">
                {t('admin.patients.detail.familyCard.tableIdentification')}
              </th>
              <th className="text-left px-3 py-2 font-medium">
                {t('admin.patients.detail.familyCard.tableName')}
              </th>
              <th className="text-left px-3 py-2 font-medium">
                {t('admin.patients.detail.familyCard.tablePhone')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center">
                  <Typography variant="body" className="text-[#737373]">
                    {t('admin.patients.detail.noData')}
                  </Typography>
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const fullName = [r.firstName, r.lastName].filter(Boolean).join(' ').trim();
                const docTypeLabel = r.documentType
                  ? t(`admin.patients.detail.documentTypes.${r.documentType}`, r.documentType)
                  : null;
                return (
                  <tr key={r.id} className="border-b border-[#D9D9D9] last:border-0 align-top">
                    <td className="px-3 py-3">
                      {formatRelationship(r.relationship, empty)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col">
                        <span>{docTypeLabel ?? empty}</span>
                        <span className="text-xs text-gray-600">
                          {r.documentNumber ?? empty}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col">
                        <span>{fullName || empty}</span>
                        {r.email ? (
                          <span className="text-xs text-gray-600">{r.email}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-3">{r.phone ?? empty}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
