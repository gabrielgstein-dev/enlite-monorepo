import { TFunction } from 'i18next';
import { SelectOption } from '@presentation/components/molecules/SelectField';

export const getAttentionOptions = (t: TFunction): SelectOption[] => [
  { value: 'complete', label: t('admin.patients.attentionOptions.complete') },
  { value: 'needs_attention', label: t('admin.patients.attentionOptions.needsAttention') },
];

export const getReasonOptions = (t: TFunction): SelectOption[] => [
  { value: 'MISSING_INFO', label: t('admin.patients.reasonOptions.MISSING_INFO') },
];

export const getSpecialtyOptions = (t: TFunction): SelectOption[] => [
  { value: 'INTELLECTUAL_DISABILITY', label: t('admin.patients.specialtyOptions.INTELLECTUAL_DISABILITY') },
  { value: 'NEUROLOGICAL', label: t('admin.patients.specialtyOptions.NEUROLOGICAL') },
  { value: 'MOTOR_LIMITATIONS', label: t('admin.patients.specialtyOptions.MOTOR_LIMITATIONS') },
  { value: 'ASD', label: t('admin.patients.specialtyOptions.ASD') },
  { value: 'PSYCHIATRIC', label: t('admin.patients.specialtyOptions.PSYCHIATRIC') },
  { value: 'SOCIAL_VULNERABILITY', label: t('admin.patients.specialtyOptions.SOCIAL_VULNERABILITY') },
  { value: 'GERIATRIC', label: t('admin.patients.specialtyOptions.GERIATRIC') },
  { value: 'SPECIFIC_PATHOLOGY', label: t('admin.patients.specialtyOptions.SPECIFIC_PATHOLOGY') },
  { value: 'CUSTOM', label: t('admin.patients.specialtyOptions.CUSTOM') },
];

export const getDependencyOptions = (t: TFunction): SelectOption[] => [
  { value: 'SEVERE', label: t('admin.patients.dependencyOptions.SEVERE') },
  { value: 'VERY_SEVERE', label: t('admin.patients.dependencyOptions.VERY_SEVERE') },
  { value: 'MODERATE', label: t('admin.patients.dependencyOptions.MODERATE') },
  { value: 'MILD', label: t('admin.patients.dependencyOptions.MILD') },
];

/**
 * Maps the attention filter value to the API query params.
 * 'complete'        → needs_attention=false
 * 'needs_attention' → needs_attention=true
 * ''                → omit param
 */
export function attentionToApiParam(value: string): string | undefined {
  if (value === 'complete') return 'false';
  if (value === 'needs_attention') return 'true';
  return undefined;
}
