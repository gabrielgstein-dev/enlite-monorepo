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
  return (
    <div className="grid grid-cols-4 gap-4 w-full">
      <SelectField
        value={tipoValue}
        onChange={onTipoChange}
        options={tipoOptions}
        label="Tipos de vacantes"
      />
      <SelectField
        value={localValue}
        onChange={onLocalChange}
        options={localOptions}
        label="Lugares de trabalho"
      />
      <SelectField
        value={areaValue}
        onChange={onAreaChange}
        options={areaOptions}
        label="Áreas"
      />
      <SelectField
        value={sexoValue}
        onChange={onSexoChange}
        options={sexoOptions}
        label="Sexo"
      />
    </div>
  );
};
