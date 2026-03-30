// =====================
// WebhookPartner — entidade de domínio para parceiros autorizados a chamar webhooks
//
// A validação da API Key é feita via Google API (lookupKey).
// Esta entidade mapeia o displayName da key no GCP a paths permitidos.
// =====================

export interface WebhookPartner {
  id: string;
  name: string;           // 'talentum', 'anacare'
  displayName: string;    // 'API-Key-Talentum' (como no GCP Console)
  allowedPaths: string[]; // ['talentum/*']
  isActive: boolean;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface PartnerContext {
  partnerId: string;
  partnerName: string;
  isTest: boolean;
}
