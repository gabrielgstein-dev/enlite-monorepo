/**
 * workerExportColumns.ts
 *
 * Canonical list of the 33 column keys accepted by GET /api/admin/workers/export.
 * Each key maps to an i18n translation key used in the export modal column list.
 *
 * Labels are reused from workerDetailLabels.ts where a mapping already exists;
 * new labels are stored under admin.workers.export.columns.* in the i18n files.
 */

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

/** All 33 column keys in display order */
export const ALL_EXPORT_COLUMNS: WorkerExportColumnKey[] = [
  'first_name',
  'last_name',
  'email',
  'phone',
  'whatsapp_phone',
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
  'diagnostic_preferences',
  'languages',
  'hobbies',
  'sexual_orientation',
  'race',
  'religion',
  'weight_kg',
  'height_cm',
  'linkedin_url',
  'address_line',
  'city',
  'postal_code',
  'country',
  'status',
  'created_at',
];

/**
 * Maps each column key to its i18n translation key.
 * Reuses existing workerRegistration.generalInfo keys where applicable.
 */
export const COLUMN_LABEL_KEY: Record<WorkerExportColumnKey, string> = {
  first_name:             'admin.workers.export.columns.first_name',
  last_name:              'admin.workers.export.columns.last_name',
  email:                  'admin.workers.export.columns.email',
  phone:                  'admin.workers.export.columns.phone',
  whatsapp_phone:         'admin.workers.export.columns.whatsapp_phone',
  gender:                 'admin.workers.export.columns.gender',
  sex:                    'admin.workers.export.columns.sex',
  birth_date:             'admin.workers.export.columns.birth_date',
  document_type:          'admin.workers.export.columns.document_type',
  document_number:        'admin.workers.export.columns.document_number',
  profession:             'admin.workers.export.columns.profession',
  occupation:             'admin.workers.export.columns.occupation',
  knowledge_level:        'admin.workers.export.columns.knowledge_level',
  title_certificate:      'admin.workers.export.columns.title_certificate',
  years_experience:       'admin.workers.export.columns.years_experience',
  experience_types:       'admin.workers.export.columns.experience_types',
  preferred_types:        'admin.workers.export.columns.preferred_types',
  preferred_age_range:    'admin.workers.export.columns.preferred_age_range',
  diagnostic_preferences: 'admin.workers.export.columns.diagnostic_preferences',
  languages:              'admin.workers.export.columns.languages',
  hobbies:                'admin.workers.export.columns.hobbies',
  sexual_orientation:     'admin.workers.export.columns.sexual_orientation',
  race:                   'admin.workers.export.columns.race',
  religion:               'admin.workers.export.columns.religion',
  weight_kg:              'admin.workers.export.columns.weight_kg',
  height_cm:              'admin.workers.export.columns.height_cm',
  linkedin_url:           'admin.workers.export.columns.linkedin_url',
  address_line:           'admin.workers.export.columns.address_line',
  city:                   'admin.workers.export.columns.city',
  postal_code:            'admin.workers.export.columns.postal_code',
  country:                'admin.workers.export.columns.country',
  status:                 'admin.workers.export.columns.status',
  created_at:             'admin.workers.export.columns.created_at',
};
