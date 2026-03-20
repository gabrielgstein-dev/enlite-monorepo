import admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';

export type DocumentType =
  | 'resume_cv'
  | 'identity_document'
  | 'criminal_record'
  | 'professional_registration'
  | 'liability_insurance';

export interface SignedUploadResult {
  signedUrl: string;
  filePath: string;
}

/**
 * Check if running in development mode without GCP credentials.
 * In this mode, we mock GCS operations since we can't sign URLs.
 */
function isMockMode(): boolean {
  // If explicitly disabled mock via env var
  if (process.env.DISABLE_GCS_MOCK === 'true') return false;
  
  // Check if we're in development/test without proper GCP credentials
  const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
  const hasNoCredentials = !process.env.GOOGLE_APPLICATION_CREDENTIALS && 
                           !process.env.GCP_PROJECT_ID;
  
  return isDev && hasNoCredentials;
}

export class GCSStorageService {
  private readonly bucketName: string;
  private readonly mockMode: boolean;

  constructor() {
    this.bucketName = process.env.GCS_BUCKET_NAME ?? 'enlite-worker-documents';
    this.mockMode = isMockMode();
    
    if (this.mockMode) {
      console.log('[GCSStorageService] Running in MOCK mode - uploads will be simulated');
    }
  }

  private getBucket() {
    return admin.storage().bucket(this.bucketName);
  }

  async generateUploadSignedUrl(
    workerId: string,
    docType: DocumentType,
  ): Promise<SignedUploadResult> {
    const filePath = `workers/${workerId}/${docType}/${uuidv4()}.pdf`;
    console.log('[GCSStorageService.generateUploadSignedUrl] workerId:', workerId, '| docType:', docType, '| filePath:', filePath, '| mockMode:', this.mockMode);

    // Mock mode: return fake URL that frontend can "upload" to
    if (this.mockMode) {
      const mockUrl = `http://localhost:8080/mock-gcs-upload?path=${encodeURIComponent(filePath)}`;
      console.log('[GCSStorageService.generateUploadSignedUrl] MOCK URL generated');
      return { signedUrl: mockUrl, filePath };
    }

    const file = this.getBucket().file(filePath);

    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 15 * 60 * 1000,
      contentType: 'application/pdf',
    });

    console.log('[GCSStorageService.generateUploadSignedUrl] signed URL generated OK | bucket:', this.bucketName);
    return { signedUrl, filePath };
  }

  async generateViewSignedUrl(filePath: string): Promise<string> {
    // Mock mode: return placeholder URL
    if (this.mockMode) {
      return `http://localhost:8080/mock-gcs-view?path=${encodeURIComponent(filePath)}`;
    }

    const file = this.getBucket().file(filePath);
    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000,
    });
    return signedUrl;
  }

  async deleteFile(filePath: string): Promise<void> {
    // Mock mode: just log, don't actually delete
    if (this.mockMode) {
      console.log('[GCSStorageService] Mock delete:', filePath);
      return;
    }

    const file = this.getBucket().file(filePath);
    await file.delete({ ignoreNotFound: true });
  }
}
