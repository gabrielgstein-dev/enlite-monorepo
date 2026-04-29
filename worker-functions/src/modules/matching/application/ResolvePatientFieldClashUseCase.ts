import { Pool } from 'pg';
import { DatabaseConnection } from '@shared/database/DatabaseConnection';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export interface PatientFieldClash {
  field: 'pathology_types' | 'dependency_level';
  pdfValue: string | null;
  patientValue: string | null;
  action: 'IDENTICAL' | 'CLASH' | 'PDF_ONLY' | 'PATIENT_ONLY';
}

export interface ResolvePatientFieldClashInput {
  patientId: string;
  pdfPathologyTypes: string | null;
  pdfDependencyLevel: string | null;
}

interface PatientFieldRow {
  diagnosis: string | null;
  dependency_level: string | null;
}

// ─────────────────────────────────────────────────────────────────
// Use Case
// ─────────────────────────────────────────────────────────────────

/**
 * ResolvePatientFieldClashUseCase
 *
 * Compares PDF-extracted fields (pathology_types, dependency_level)
 * against the patient record in the database.
 *
 * Returns only fields where action != 'IDENTICAL'.
 * IDENTICAL is the happy path and is omitted from output.
 */
export class ResolvePatientFieldClashUseCase {
  private pool: Pool;

  constructor() {
    this.pool = DatabaseConnection.getInstance().getPool();
  }

  async execute(input: ResolvePatientFieldClashInput): Promise<PatientFieldClash[]> {
    const { patientId, pdfPathologyTypes, pdfDependencyLevel } = input;

    const result = await this.pool.query<PatientFieldRow>(
      `SELECT diagnosis, dependency_level FROM patients WHERE id = $1`,
      [patientId],
    );

    if (result.rows.length === 0) {
      return [];
    }

    const patient = result.rows[0];
    const clashes: PatientFieldClash[] = [];

    const pathologyClash = this.compareField(
      'pathology_types',
      pdfPathologyTypes,
      patient.diagnosis,
    );
    if (pathologyClash) clashes.push(pathologyClash);

    const dependencyClash = this.compareField(
      'dependency_level',
      pdfDependencyLevel,
      patient.dependency_level,
    );
    if (dependencyClash) clashes.push(dependencyClash);

    return clashes;
  }

  private compareField(
    field: PatientFieldClash['field'],
    pdfValue: string | null,
    patientValue: string | null,
  ): PatientFieldClash | null {
    const hasPdf = pdfValue !== null && pdfValue !== undefined;
    const hasPatient = patientValue !== null && patientValue !== undefined;

    // Both null → skip
    if (!hasPdf && !hasPatient) return null;

    // Same value (case-insensitive trim) → skip (happy path)
    if (hasPdf && hasPatient) {
      const normalizedPdf = pdfValue!.trim().toLowerCase();
      const normalizedPatient = patientValue!.trim().toLowerCase();
      if (normalizedPdf === normalizedPatient) return null; // IDENTICAL
    }

    const action: PatientFieldClash['action'] =
      hasPdf && hasPatient
        ? 'CLASH'
        : hasPdf
        ? 'PDF_ONLY'
        : 'PATIENT_ONLY';

    return { field, pdfValue: pdfValue ?? null, patientValue: patientValue ?? null, action };
  }
}
