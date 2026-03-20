export interface WorkerPaymentInfo {
  id: string;
  workerId: string;
  
  // Bank account details
  country: 'AR' | 'BR';
  accountHolderName: string;
  taxId?: string;  // CUIT/CUIL (AR) or CPF/CNPJ (BR)
  
  // Bank details
  bankName?: string;
  bankBranch?: string;
  accountNumber?: string;
  accountType?: 'checking' | 'savings';
  
  // PIX (BR) or CVU/Alias (AR)
  pixKey?: string;
  
  // Verification status
  paymentStatus: PaymentStatus;
  
  // Feedback
  verificationNotes?: string;
  verifiedBy?: string;
  verifiedAt?: Date;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

export type PaymentStatus = 
  | 'pending'    // Not filled yet
  | 'submitted'  // Submitted, awaiting verification
  | 'verified'   // ✅ Verified and approved
  | 'rejected';  // ❌ Rejected, needs correction

export interface CreateWorkerPaymentInfoDTO {
  workerId: string;
  country: 'AR' | 'BR';
  accountHolderName: string;
  taxId?: string;
  bankName?: string;
  bankBranch?: string;
  accountNumber?: string;
  accountType?: 'checking' | 'savings';
  pixKey?: string;
}

export interface UpdateWorkerPaymentInfoDTO {
  workerId: string;
  accountHolderName?: string;
  taxId?: string;
  bankName?: string;
  bankBranch?: string;
  accountNumber?: string;
  accountType?: 'checking' | 'savings';
  pixKey?: string;
}

export interface VerifyWorkerPaymentInfoDTO {
  workerId: string;
  paymentStatus: 'verified' | 'rejected';
  verificationNotes?: string;
  verifiedBy: string;
}
