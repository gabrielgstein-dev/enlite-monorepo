import { useTranslation } from 'react-i18next';
import { Typography } from '@presentation/components/atoms/Typography';
import { SelectField, SelectOption } from '@presentation/components/molecules/SelectField';

interface WorkerFiltersProps {
  selectedPlatform: string;
  onPlatformChange: (value: string) => void;
  selectedDocsStatus: string;
  onDocsStatusChange: (value: string) => void;
  platformOptions: SelectOption[];
  docsStatusOptions: SelectOption[];
}

export function WorkerFilters({
  selectedPlatform,
  onPlatformChange,
  selectedDocsStatus,
  onDocsStatusChange,
  platformOptions,
  docsStatusOptions,
}: WorkerFiltersProps): JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="bg-white rounded-b-[20px] border-r-2 border-b-2 border-l-2 border-[#D9D9D9] flex items-center px-7 py-6 gap-4 flex-wrap">
      <div className="flex items-end gap-4 flex-wrap">
        <div className="w-full sm:w-[220px]">
          <Typography variant="body" weight="semibold" className="text-[#737373] mb-1 font-lexend text-base">
            {t('admin.workers.platformLabel', 'Plataforma')}
          </Typography>
          <SelectField
            options={platformOptions}
            value={selectedPlatform}
            onChange={onPlatformChange}
            placeholder={t('admin.workers.platformOptions.all', 'Todas')}
          />
        </div>
        <div className="w-full sm:w-[220px]">
          <Typography variant="body" weight="semibold" className="text-[#737373] mb-1 font-lexend text-base">
            {t('admin.workers.docsLabel', 'Documentação')}
          </Typography>
          <SelectField
            options={docsStatusOptions}
            value={selectedDocsStatus}
            onChange={onDocsStatusChange}
            placeholder={t('admin.workers.docsOptions.all', 'Todos')}
          />
        </div>
      </div>
    </div>
  );
}
