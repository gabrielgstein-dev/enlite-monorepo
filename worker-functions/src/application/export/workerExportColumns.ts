/**
 * workerExportColumns.ts
 *
 * Authoritative list of column keys accepted by GET /api/admin/workers/export.
 *
 * Rules:
 * - Keys are stable snake_case identifiers — do NOT rename them once deployed.
 * - Labels live on the frontend (workerDetailLabels.ts). Backend is key-only.
 * - Encrypted columns map to their _encrypted DB counterparts and are
 *   decrypted at export time via KMSEncryptionService.
 */

// TODO: future — per-column PII permissions (sexual_orientation, race, religion,
// document_number, birth_date, etc.). Today: admin-only guard is the sole access control.

/** Column key used in the `columns` query param (e.g. "first_name,email,status"). */
export type WorkerExportColumnKey =
  | 'first_name'
  | 'last_name'
  | 'email'
  | 'phone'
  | 'gender'
  | 'sex'
  | 'birth_date'
  | 'document_type'
  | 'document_number'
  | 'profession'
  | 'occupation'
  | 'knowledge_level'
  | 'title_certificate'
  | 'years_experience'
  | 'experience_types'
  | 'preferred_types'
  | 'preferred_age_range'
  | 'hobbies'
  | 'diagnostic_preferences'
  | 'languages'
  | 'sexual_orientation'
  | 'race'
  | 'religion'
  | 'weight_kg'
  | 'height_cm'
  | 'whatsapp_phone'
  | 'linkedin_url'
  | 'address_line'
  | 'city'
  | 'postal_code'
  | 'country'
  | 'status'
  | 'created_at';

/**
 * Set of all valid export column keys. Used for O(1) validation.
 */
export const WORKER_EXPORT_COLUMN_KEYS = new Set<WorkerExportColumnKey>([
  'first_name',
  'last_name',
  'email',
  'phone',
  'gender',
  'sex',
  'birth_date',
  'document_type',
  'document_number',
  'profession',
  'occupation',
  'knowledge_level',
  'title_certificate',
  'years_experience',
  'experience_types',
  'preferred_types',
  'preferred_age_range',
  'hobbies',
  'diagnostic_preferences',
  'languages',
  'sexual_orientation',
  'race',
  'religion',
  'weight_kg',
  'height_cm',
  'whatsapp_phone',
  'linkedin_url',
  'address_line',
  'city',
  'postal_code',
  'country',
  'status',
  'created_at',
]);

/**
 * Ordered list of all valid column keys (stable order for predictable CSV headers
 * when the consumer sends all columns).
 */
export const WORKER_EXPORT_COLUMNS_ORDERED: WorkerExportColumnKey[] = [
  'first_name',
  'last_name',
  'email',
  'phone',
  'gender',
  'sex',
  'birth_date',
  'document_type',
  'document_number',
  'profession',
  'occupation',
  'knowledge_level',
  'title_certificate',
  'years_experience',
  'experience_types',
  'preferred_types',
  'preferred_age_range',
  'hobbies',
  'diagnostic_preferences',
  'languages',
  'sexual_orientation',
  'race',
  'religion',
  'weight_kg',
  'height_cm',
  'whatsapp_phone',
  'linkedin_url',
  'address_line',
  'city',
  'postal_code',
  'country',
  'status',
  'created_at',
];

/**
 * Human-readable column labels in es-AR (Argentine Spanish).
 * Source of truth for CSV/XLSX header row.
 * Values mirror admin.workers.export.columns.* in enlite-frontend/src/infrastructure/i18n/locales/es.json.
 */
export const COLUMN_LABELS_ES: Record<WorkerExportColumnKey, string> = {
  first_name: 'Nombre',
  last_name: 'Apellido',
  email: 'Correo electrónico',
  phone: 'Teléfono',
  gender: 'Género',
  sex: 'Sexo',
  birth_date: 'Fecha de nacimiento',
  document_type: 'Tipo de documento',
  document_number: 'Número de documento',
  profession: 'Profesión',
  occupation: 'Ocupación',
  knowledge_level: 'Nivel de estudios',
  title_certificate: 'Título / Certificado',
  years_experience: 'Años de experiencia',
  experience_types: 'Tipos de experiencia',
  preferred_types: 'Preferencias de atención',
  preferred_age_range: 'Rango etario preferido',
  hobbies: 'Hobbies',
  diagnostic_preferences: 'Preferencias diagnósticas',
  languages: 'Idiomas',
  sexual_orientation: 'Orientación sexual',
  race: 'Raza / Etnia',
  religion: 'Religión',
  weight_kg: 'Peso (kg)',
  height_cm: 'Altura (cm)',
  whatsapp_phone: 'WhatsApp',
  linkedin_url: 'LinkedIn',
  address_line: 'Dirección',
  city: 'Ciudad',
  postal_code: 'Código postal',
  country: 'País',
  status: 'Estado',
  created_at: 'Fecha de registro',
};
