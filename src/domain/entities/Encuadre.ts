export type EncuadreResultado =
  | 'SELECCIONADO'
  | 'RECHAZADO'
  | 'AT_NO_ACEPTA'
  | 'REPROGRAMAR'
  | 'REEMPLAZO'
  | 'BLACKLIST'
  | 'PENDIENTE';

export type LLMInterestLevel = 'ALTO' | 'MEDIO' | 'BAIXO' | 'NULO';

export interface LLMExtractedExperience {
  diagnoses: string[];
  years: number | null;
  specialties: string[];
  zones: string[];
}

export interface Encuadre {
  id: string;
  workerId: string | null;
  jobPostingId: string | null;
  workerRawName: string | null;
  workerRawPhone: string | null;
  occupationRaw: string | null;
  recruiterName: string | null;
  coordinatorName: string | null;
  recruitmentDate: Date | null;
  interviewDate: Date | null;
  interviewTime: string | null;
  meetLink: string | null;
  attended: boolean | null;
  absenceReason: string | null;
  acceptsCase: 'Si' | 'No' | 'A confirmar' | null;
  rejectionReason: string | null;
  resultado: EncuadreResultado | null;
  redireccionamiento: string | null;
  hasCv: boolean | null;
  hasDni: boolean | null;
  hasCertAt: boolean | null;
  hasAfip: boolean | null;
  hasCbu: boolean | null;
  hasAp: boolean | null;
  hasSeguros: boolean | null;
  workerEmail: string | null;
  obsReclutamiento: string | null;
  obsEncuadre: string | null;
  obsAdicionales: string | null;
  llmProcessedAt: Date | null;
  llmInterestLevel: LLMInterestLevel | null;
  llmExtractedExperience: LLMExtractedExperience | null;
  llmAvailabilityNotes: string | null;
  llmRealRejectionReason: string | null;
  llmFollowUpPotential: boolean | null;
  dedupHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateEncuadreDTO {
  workerId?: string | null;
  jobPostingId?: string | null;
  workerRawName?: string | null;
  workerRawPhone?: string | null;
  occupationRaw?: string | null;
  recruiterName?: string | null;
  coordinatorName?: string | null;
  recruitmentDate?: Date | null;
  interviewDate?: Date | null;
  interviewTime?: string | null;
  meetLink?: string | null;
  attended?: boolean | null;
  absenceReason?: string | null;
  acceptsCase?: 'Si' | 'No' | 'A confirmar' | null;
  rejectionReason?: string | null;
  resultado?: EncuadreResultado | null;
  redireccionamiento?: string | null;
  hasCv?: boolean | null;
  hasDni?: boolean | null;
  hasCertAt?: boolean | null;
  hasAfip?: boolean | null;
  hasCbu?: boolean | null;
  hasAp?: boolean | null;
  hasSeguros?: boolean | null;
  workerEmail?: string | null;
  obsReclutamiento?: string | null;
  obsEncuadre?: string | null;
  obsAdicionales?: string | null;
  dedupHash: string;
}

export interface UpdateEncuadreLLMDTO {
  id: string;
  llmInterestLevel: LLMInterestLevel;
  llmExtractedExperience: LLMExtractedExperience;
  llmAvailabilityNotes: string | null;
  llmRealRejectionReason: string | null;
  llmFollowUpPotential: boolean;
  llmRawResponse: Record<string, unknown>;
}

export interface EncuadreFilters {
  workerId?: string;
  jobPostingId?: string;
  resultado?: EncuadreResultado;
  llmPendingOnly?: boolean;
  recruitmentDateFrom?: Date;
  recruitmentDateTo?: Date;
}
