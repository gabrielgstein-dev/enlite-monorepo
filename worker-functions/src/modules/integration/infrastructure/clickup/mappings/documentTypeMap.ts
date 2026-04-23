import type { DocumentType } from '@modules/case';

/**
 * Translates ClickUp "Tipo de Documento Paciente" drop-down labels to canonical DocumentType.
 * Note: ClickUp has a typo "Passaporte" (should be "Pasaporte" in Spanish) — preserved as-is.
 */
export const CLICKUP_TO_DOCUMENT_TYPE: Record<string, DocumentType> = {
  'DNI':        'DNI',       // ClickUp: "DNI"
  'Passaporte': 'PASSPORT',  // ClickUp: "Passaporte" (typo — should be "Pasaporte" in ES)
  'Cédula':     'CEDULA',    // ClickUp: "Cédula" (es)
  'LE/LC':      'LE_LC',     // ClickUp: "LE/LC"
  'CPF':        'CPF',       // ClickUp: "CPF"
};

export function mapClickUpDocumentType(label: string | null): DocumentType | null {
  if (!label) return null;
  return CLICKUP_TO_DOCUMENT_TYPE[label] ?? null;
}
