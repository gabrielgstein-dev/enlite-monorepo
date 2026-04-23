// =====================
// WorkerDocExpiry — campos de vencimento (migration 015)
// =====================
export interface WorkerDocExpiry {
  workerId: string;
  criminalRecordExpiry: Date | null;
  insuranceExpiry: Date | null;
  professionalRegExpiry: Date | null;
  // Flags calculadas (da view workers_docs_expiry_alert)
  criminalExpiringSoon?: boolean;
  insuranceExpiringSoon?: boolean;
  profregExpiringSoon?: boolean;
  criminalExpired?: boolean;
  insuranceExpired?: boolean;
  profregExpired?: boolean;
}

export interface UpdateDocExpiryDTO {
  workerId: string;
  criminalRecordExpiry?: Date | null;
  insuranceExpiry?: Date | null;
  professionalRegExpiry?: Date | null;
}
