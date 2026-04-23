/**
 * PatientResponsible — responsável legal do paciente.
 * 1 paciente → N responsáveis. 1 titular obrigatório (enforce via aplicação).
 * Owner: case-service (futuro GKE+Istio).
 * Persisted in: PatientResponsibleRepository (Postgres — always).
 */
export interface PatientResponsible {
  id: string;
  patientId: string;
  firstName: string;
  lastName: string;
  relationship: string | null;
  /** WhatsApp number — stored KMS encrypted. Decrypted value for app use. */
  phone: string | null;
  /** Email — stored KMS encrypted. Decrypted value for app use. */
  email: string | null;
  /** Document number (DNI/CPF) — stored KMS encrypted. Decrypted value for app use. */
  documentNumber: string | null;
  documentType: string | null;
  isPrimary: boolean;
  displayOrder: number;
  source: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input DTO for creating/replacing a patient responsible.
 * Plaintext values — encryption happens in PatientResponsibleRepository.
 */
export interface PatientResponsibleInput {
  firstName: string;
  lastName: string;
  relationship?: string | null;
  phone?: string | null;
  email?: string | null;
  documentType?: string | null;
  documentNumber?: string | null;
  isPrimary: boolean;
  displayOrder: number;
  source?: string;
}

/**
 * Validation: at least one contact channel between patient and primary responsible.
 * Enforced in PatientService (not via SQL constraint).
 */
export interface ContactChannelValidationInput {
  patientPhoneWhatsapp: string | null | undefined;
  primaryResponsible: PatientResponsibleInput | undefined;
}

export function validateContactChannel(input: ContactChannelValidationInput): void {
  const hasPatientPhone = !!input.patientPhoneWhatsapp?.trim();
  const hasPrimaryPhone = !!input.primaryResponsible?.phone?.trim();
  const hasPrimaryEmail = !!input.primaryResponsible?.email?.trim();

  if (!hasPatientPhone && !hasPrimaryPhone && !hasPrimaryEmail) {
    throw new Error(
      'Validação de contato: paciente ou responsável titular precisa de ao menos 1 canal (phone_whatsapp do paciente, phone ou email do responsável)',
    );
  }
}
