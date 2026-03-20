export interface WorkerDocuments {
  id: string;
  workerId: string;
  
  // Document URLs (stored in Cloud Storage)
  resumeCvUrl?: string;
  identityDocumentUrl?: string;
  criminalRecordUrl?: string;
  professionalRegistrationUrl?: string;
  liabilityInsuranceUrl?: string;
  
  // Additional certificates
  additionalCertificatesUrls: string[];
  
  // Document status
  documentsStatus: DocumentsStatus;
  
  // Review feedback
  reviewNotes?: string;
  reviewedBy?: string;
  reviewedAt?: Date;
  
  // Submission tracking
  submittedAt?: Date;
  resubmittedAt?: Date;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

export type DocumentsStatus = 
  | 'pending'       // Worker hasn't submitted documents yet
  | 'incomplete'    // Some documents are missing
  | 'submitted'     // All documents submitted, awaiting review
  | 'under_review'  // Being reviewed by admin
  | 'approved'      // ✅ Approved - worker can apply to jobs
  | 'rejected';     // ❌ Rejected - needs to resubmit

export interface CreateWorkerDocumentsDTO {
  workerId: string;
  resumeCvUrl?: string;
  identityDocumentUrl?: string;
  criminalRecordUrl?: string;
  professionalRegistrationUrl?: string;
  liabilityInsuranceUrl?: string;
  additionalCertificatesUrls?: string[];
}

export interface UpdateWorkerDocumentsDTO {
  workerId: string;
  resumeCvUrl?: string;
  identityDocumentUrl?: string;
  criminalRecordUrl?: string;
  professionalRegistrationUrl?: string;
  liabilityInsuranceUrl?: string;
  additionalCertificatesUrls?: string[];
  documentsStatus?: DocumentsStatus;
}

export interface ReviewWorkerDocumentsDTO {
  workerId: string;
  documentsStatus: 'approved' | 'rejected';
  reviewNotes?: string;
  reviewedBy: string;
}
