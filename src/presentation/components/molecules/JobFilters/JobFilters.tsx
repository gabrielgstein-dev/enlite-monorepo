import { Select, type SelectOption } from '@presentation/components/ui/Select';

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
      <Select
        value={tipoValue}
        onChange={onTipoChange}
        options={tipoOptions}
        label="Tipos de vacantes"
      />
      <Select
        value={localValue}
        onChange={onLocalChange}
        options={localOptions}
        label="Lugares de trabalho"
      />
      <Select
        value={areaValue}
        onChange={onAreaChange}
        options={areaOptions}
        label="Áreas"
      />
      <Select
        value={sexoValue}
        onChange={onSexoChange}
        options={sexoOptions}
        label="Sexo"
      />
    </div>
  );
};
