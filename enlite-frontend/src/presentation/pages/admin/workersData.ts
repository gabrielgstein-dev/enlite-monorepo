import { TFunction } from 'i18next';
import { SelectOption } from '@presentation/components/molecules/SelectField';

export const getPlatformOptions = (t: TFunction): SelectOption[] => [
  { value: '', label: t('admin.workers.platformOptions.all', 'Todas') },
  { value: 'talentum', label: 'Talentum' },
  { value: 'planilla_operativa', label: 'Planilla Operativa' },
  { value: 'ana_care', label: 'Ana Care' },
  { value: 'talent_search', label: 'Talent Search' },
  { value: 'enlite_app', label: 'Enlite App' },
];

export const getDocsStatusOptions = (t: TFunction): SelectOption[] => [
  { value: '', label: t('admin.workers.docsOptions.all', 'Todos') },
  { value: 'complete', label: t('admin.workers.docsOptions.complete', 'Completos') },
  { value: 'incomplete', label: t('admin.workers.docsOptions.incomplete', 'Incompletos') },
];

export const PLATFORM_LABELS: Record<string, string> = {
  talentum: 'Talentum',
  planilla_operativa: 'Planilla Operativa',
  ana_care: 'Ana Care',
  talent_search: 'Talent Search',
  enlite_app: 'Enlite App',
};
