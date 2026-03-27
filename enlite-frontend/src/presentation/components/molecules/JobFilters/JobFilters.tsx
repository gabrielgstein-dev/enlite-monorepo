import { useTranslation } from 'react-i18next';
import { SelectField, type SelectOption } from '@presentation/components/molecules/SelectField';

interface JobFiltersProps {
  tipoValue: string;
  localValue: string;
  areaValue: string;
  sexoValue: string;
  onTipoChange: (value: string) => void;
  onLocalChange: (value: string) => void;
  onAreaChange: (value: string) => void;
  onSexoChange: (value: string) => void;
  tipoOptions: SelectOption[];
  localOptions: SelectOption[];
  areaOptions: SelectOption[];
  sexoOptions: SelectOption[];
}

export const JobFilters = ({
  tipoValue,
  localValue,
  areaValue,
  sexoValue,
  onTipoChange,
  onLocalChange,
  onAreaChange,
  onSexoChange,
  tipoOptions,
  localOptions,
  areaOptions,
  sexoOptions,
}: JobFiltersProps): JSX.Element => {
  const { t } = useTranslation();
  
  return (
    <div className="grid grid-cols-4 gap-4 w-full">
      <SelectField
        value={tipoValue}
        onChange={onTipoChange}
        options={tipoOptions}
        label={t('jobs.filterLabels.jobTypes')}
      />
      <SelectField
        value={localValue}
        onChange={onLocalChange}
        options={localOptions}
        label={t('jobs.filterLabels.workLocations')}
      />
      <SelectField
        value={areaValue}
        onChange={onAreaChange}
        options={areaOptions}
        label={t('jobs.filterLabels.areas')}
      />
      <SelectField
        value={sexoValue}
        onChange={onSexoChange}
        options={sexoOptions}
        label={t('jobs.filterLabels.gender')}
      />
    </div>
  );
};
