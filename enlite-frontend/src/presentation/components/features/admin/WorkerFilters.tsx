import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { Typography } from '@presentation/components/atoms/Typography';
import { SelectField, SelectOption } from '@presentation/components/molecules/SelectField';
import { SearchableSelect, SearchableSelectOption } from '@presentation/components/molecules/SearchableSelect/SearchableSelect';

interface WorkerFiltersProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  selectedDocsStatus: string;
  onDocsStatusChange: (value: string) => void;
  docsStatusOptions: SelectOption[];
  caseOptions: SearchableSelectOption[];
  selectedCaseId: string;
  onCaseChange: (value: string) => void;
  isCaseOptionsLoading?: boolean;
}

export function WorkerFilters({
  searchValue,
  onSearchChange,
  selectedDocsStatus,
  onDocsStatusChange,
  docsStatusOptions,
  caseOptions,
  selectedCaseId,
  onCaseChange,
  isCaseOptionsLoading = false,
}: WorkerFiltersProps): JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="bg-white rounded-b-[20px] border-r-2 border-b-2 border-l-2 border-[#D9D9D9] flex items-center px-7 py-6 gap-4 flex-wrap">
      <div className="flex items-end gap-4 flex-wrap">
        <div className="w-full sm:w-[220px]">
          <Typography variant="body" weight="semibold" className="text-[#737373] mb-1 font-lexend text-base">
            {t('admin.workers.caseLabel', 'Caso')}
          </Typography>
          <SearchableSelect
            options={caseOptions}
            value={selectedCaseId}
            onChange={onCaseChange}
            placeholder={t('admin.workers.caseOptions.all', 'Todos')}
            searchPlaceholder={t('admin.workers.caseSearchPlaceholder', 'Buscar caso...')}
            disabled={isCaseOptionsLoading}
          />
        </div>

        <div className="w-full sm:w-[300px]">
          <Typography variant="body" weight="semibold" className="text-[#737373] mb-1 font-lexend text-base">
            {t('admin.workers.searchLabel', 'Buscar')}
          </Typography>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#737373]" />
            <input
              type="text"
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t('admin.workers.searchPlaceholder', 'Nombre, email o teléfono')}
              className="w-full h-[42px] pl-10 pr-3 rounded-lg border border-[#D9D9D9] bg-white text-sm font-lexend text-[#333] placeholder:text-[#B3B3B3] focus:outline-none focus:ring-2 focus:ring-[#6B21A8] focus:border-transparent"
            />
          </div>
        </div>

        <div className="w-full sm:w-[220px]">
          <Typography variant="body" weight="semibold" className="text-[#737373] mb-1 font-lexend text-base">
            {t('admin.workers.docsLabel', 'Documentación')}
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
