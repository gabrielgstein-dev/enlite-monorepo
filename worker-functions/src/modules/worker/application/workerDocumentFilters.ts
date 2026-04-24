/**
 * workerDocumentFilters.ts
 *
 * Shared helper for the "all documents validated" filter used by both the
 * worker list endpoint and the export endpoint.
 *
 * Slug values here are the SQL/JSON keys stored in
 * worker_documents.document_validations — not the camelCase TS field names
 * from WorkerDocumentsRepository.
 *
 * camelCase ↔ slug mapping:
 *   resumeCvUrl                → resume_cv
 *   identityDocumentUrl        → identity_document
 *   identityDocumentBackUrl    → identity_document_back
 *   criminalRecordUrl          → criminal_record
 *   professionalRegistrationUrl→ professional_registration
 *   liabilityInsuranceUrl      → liability_insurance
 *   monotributoCertificateUrl  → monotributo_certificate  (AT-only)
 *   atCertificateUrl           → at_certificate           (AT-only)
 */

/** Base required doc slugs for all workers (profession != 'AT' or NULL). */
export const REQUIRED_DOC_SLUGS_BASE: readonly string[] = [
  'resume_cv',
  'identity_document',
  'identity_document_back',
  'criminal_record',
  'professional_registration',
  'liability_insurance',
] as const;

/** Extra required doc slugs when profession = 'AT' (appended to base). */
export const REQUIRED_DOC_SLUGS_AT_EXTRA: readonly string[] = [
  'monotributo_certificate',
  'at_certificate',
] as const;

/**
 * Returns a SQL fragment that evaluates to true when the worker has ALL
 * required doc slugs present as keys in document_validations.
 *
 * Assumptions (matching the existing list/export queries):
 *   - The `workers` table is always aliased as `w`.
 *   - The `worker_documents` table alias is passed via `wdAlias` (typically 'wd').
 *
 * Uses `jsonb_exists_all()` (the function form of `?&`) to avoid the `pg`
 * driver mis-interpreting `?` as a positional parameter placeholder.
 *
 * Usage in WHERE:
 *   `AND ${buildAllValidatedClause('wd')}`
 */
export function buildAllValidatedClause(wdAlias: string): string {
  const baseSlugs = REQUIRED_DOC_SLUGS_BASE.map((s) => `'${s}'`).join(', ');
  const allSlugs = [...REQUIRED_DOC_SLUGS_BASE, ...REQUIRED_DOC_SLUGS_AT_EXTRA]
    .map((s) => `'${s}'`)
    .join(', ');

  return (
    `(${wdAlias}.document_validations IS NOT NULL` +
    ` AND (CASE WHEN w.profession = 'AT'` +
    ` THEN jsonb_exists_all(${wdAlias}.document_validations, array[${allSlugs}])` +
    ` ELSE jsonb_exists_all(${wdAlias}.document_validations, array[${baseSlugs}])` +
    ` END))`
  );
}
