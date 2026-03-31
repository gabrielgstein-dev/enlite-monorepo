export interface Worker {
  id: string;
  authUid: string;
  email: string;
  phone?: string;
  whatsappPhone?: string;
  lgpdConsentAt?: Date;
  
  firstName?: string;
  lastName?: string;
  sex?: string;
  gender?: string;
  birthDate?: Date;
  documentType?: string;
  documentNumber?: string;
  profilePhotoUrl?: string;
  
  languages?: string[];
  profession?: string;
  knowledgeLevel?: string;
  titleCertificate?: string;
  experienceTypes?: string[];
  yearsExperience?: string;
  preferredTypes?: string[];
  preferredAgeRange?: string;
  
  // Extended demographic fields (collected in documents screen)
  sexualOrientation?: string;
  race?: string;
  religion?: string;
  weightKg?: number;
  heightCm?: number;
  hobbies?: string[];
  diagnosticPreferences?: string[];
  linkedinUrl?: string;
  
  currentStep: number;
  status: WorkerStatus;
  registrationCompleted: boolean;
  country: string;
  timezone: string;
  
  termsAcceptedAt?: Date;
  privacyAcceptedAt?: Date;
  
  createdAt: Date;
  updatedAt: Date;
}

export type WorkerStatus = 'REGISTERED' | 'INCOMPLETE_REGISTER' | 'DISABLED';

export interface CreateWorkerDTO {
  authUid: string;
  email: string;
  /** WhatsApp phone number (optional at registration, can be filled in Step 1) */
  phone?: string;
  /** Separate WhatsApp contact number provided at registration */
  whatsappPhone?: string;
  /** Whether user accepted LGPD consent at registration */
  lgpdOptIn?: boolean;
  country?: string;
  timezone?: string;
}

export interface UpdateWorkerStepDTO {
  workerId: string;
  step: number;
  status?: WorkerStatus;
}

export interface SaveQuizResponseDTO {
  workerId: string;
  responses: Array<{
    sectionId: string;
    questionId: string;
    answerId: string;
  }>;
}

export interface SavePersonalInfoDTO {
  workerId: string;
  firstName: string;
  lastName: string;
  sex: string;
  gender: string;
  birthDate: string;
  documentType: string;
  documentNumber: string;
  phone: string;
  profilePhotoUrl?: string;
  languages: string[];
  profession: string;
  knowledgeLevel: string;
  titleCertificate: string;
  experienceTypes: string[];
  yearsExperience: string;
  preferredTypes: string[];
  preferredAgeRange: string;
  termsAccepted: boolean;
  privacyAccepted: boolean;
}

export interface SaveServiceAreaDTO {
  workerId: string;
  address: string;
  addressComplement?: string;
  serviceRadiusKm: number;
  lat: number;
  lng: number;
}

export interface SaveAvailabilityDTO {
  workerId: string;
  availability: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    crossesMidnight?: boolean;
  }>;
}
