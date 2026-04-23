/**
 * AcquisitionChannel — canonical vocabulary for how the patient was acquired.
 * Mapped from ClickUp "Canales de Marketing" field.
 * Rule: feedback_enum_values_english_uppercase.md
 */

export type AcquisitionChannel =
  | 'WHATSAPP_GROUPS'
  | 'FACEBOOK'
  | 'INSTAGRAM'
  | 'REFERRAL'
  | 'EMAIL'
  | 'LINKEDIN'
  | 'CPSA'
  | 'UNIVERSITY'
  | 'OTHER_INSTITUTION';

export const ACQUISITION_CHANNELS: readonly AcquisitionChannel[] = [
  'WHATSAPP_GROUPS',
  'FACEBOOK',
  'INSTAGRAM',
  'REFERRAL',
  'EMAIL',
  'LINKEDIN',
  'CPSA',
  'UNIVERSITY',
  'OTHER_INSTITUTION',
] as const;

export function isAcquisitionChannel(value: unknown): value is AcquisitionChannel {
  return typeof value === 'string' && (ACQUISITION_CHANNELS as readonly string[]).includes(value);
}
