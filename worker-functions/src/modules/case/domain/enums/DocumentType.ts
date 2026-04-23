/**
 * DocumentType — canonical vocabulary for identity document type.
 * Applies to both patients and patient_responsibles.
 * Rule: feedback_enum_values_english_uppercase.md
 */

export type DocumentType = 'DNI' | 'PASSPORT' | 'CEDULA' | 'LE_LC' | 'CPF';

export const DOCUMENT_TYPES: readonly DocumentType[] = [
  'DNI',
  'PASSPORT',
  'CEDULA',
  'LE_LC',
  'CPF',
] as const;

export function isDocumentType(value: unknown): value is DocumentType {
  return typeof value === 'string' && (DOCUMENT_TYPES as readonly string[]).includes(value);
}
