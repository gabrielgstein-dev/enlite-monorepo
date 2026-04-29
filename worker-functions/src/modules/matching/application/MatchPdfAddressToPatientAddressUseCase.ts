import { Pool } from 'pg';
import { DatabaseConnection } from '@shared/database/DatabaseConnection';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export interface AddressMatchCandidate {
  patient_address_id: string;
  addressFormatted: string | null;
  addressRaw: string | null;
  confidence: number; // 0-1
  matchType: 'EXACT' | 'FUZZY' | 'NONE';
}

export interface MatchPdfAddressInput {
  caseNumber: number | null;
  addressText: string | null;
}

export interface MatchPdfAddressOutput {
  patientId: string | null;
  candidates: AddressMatchCandidate[];
}

interface PatientAddressRow {
  id: string;
  address_formatted: string | null;
  address_raw: string | null;
}

// ─────────────────────────────────────────────────────────────────
// Use Case
// ─────────────────────────────────────────────────────────────────

/**
 * MatchPdfAddressToPatientAddressUseCase
 *
 * Given a case_number (from a parsed PDF) and an address text extracted
 * by Gemini, finds the patient via their most-recent non-deleted job_posting
 * and ranks their patient_addresses by similarity to the addressText.
 *
 * Returns sorted candidates (EXACT first, then FUZZY), excluding NONE.
 * If case_number is null or patient not found, returns empty candidates.
 */
export class MatchPdfAddressToPatientAddressUseCase {
  private pool: Pool;

  constructor() {
    this.pool = DatabaseConnection.getInstance().getPool();
  }

  async execute(input: MatchPdfAddressInput): Promise<MatchPdfAddressOutput> {
    const { caseNumber, addressText } = input;

    if (caseNumber === null || caseNumber === undefined) {
      return { patientId: null, candidates: [] };
    }

    // Step 1: find patient_id from most recent non-deleted job_posting
    const jpResult = await this.pool.query<{ patient_id: string | null }>(
      `SELECT patient_id
       FROM job_postings
       WHERE case_number = $1
         AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [caseNumber],
    );

    if (jpResult.rows.length === 0 || !jpResult.rows[0].patient_id) {
      return { patientId: null, candidates: [] };
    }

    const patientId = jpResult.rows[0].patient_id;

    // Step 2: get all patient_addresses for this patient
    const addrResult = await this.pool.query<PatientAddressRow>(
      `SELECT id, address_formatted, address_raw
       FROM patient_addresses
       WHERE patient_id = $1
       ORDER BY display_order ASC`,
      [patientId],
    );

    if (addrResult.rows.length === 0) {
      return { patientId, candidates: [] };
    }

    // Step 3: score each address
    const scored = addrResult.rows.map((row) =>
      this.scoreAddress(row, addressText),
    );

    // Step 4: filter out NONE, sort by confidence DESC
    const filtered = scored
      .filter((c) => c.matchType !== 'NONE')
      .sort((a, b) => b.confidence - a.confidence);

    return { patientId, candidates: filtered };
  }

  private scoreAddress(
    row: PatientAddressRow,
    addressText: string | null,
  ): AddressMatchCandidate {
    const base: AddressMatchCandidate = {
      patient_address_id: row.id,
      addressFormatted: row.address_formatted,
      addressRaw: row.address_raw,
      confidence: 0,
      matchType: 'NONE',
    };

    if (!addressText || !row.address_formatted) return base;

    const normalizedFormatted = row.address_formatted.trim().toLowerCase();
    const normalizedInput = addressText.trim().toLowerCase();

    // EXACT match
    if (normalizedFormatted === normalizedInput) {
      return { ...base, confidence: 1.0, matchType: 'EXACT' };
    }

    // FUZZY: any comma-separated segment of addressText appears in address_formatted
    const segments = normalizedInput.split(',').map((s) => s.trim()).filter(Boolean);
    const fuzzyMatch = segments.some((seg) => normalizedFormatted.includes(seg));
    if (fuzzyMatch) {
      return { ...base, confidence: 0.7, matchType: 'FUZZY' };
    }

    return base;
  }
}
