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
 * 
 * In Cloud Run, Application Default Credentials (ADC) are used automatically
 * via the service account attached to the Cloud Run service.
 */
function isMockMode(): boolean {
  // If explicitly disabled mock via env var
  if (process.env.DISABLE_GCS_MOCK === 'true') return false;
  
  // Check if we're in development/test without proper GCP credentials
  const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
  const hasNoCredentials = !process.env.GCP_PROJECT_ID;
  
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
    contentType = 'application/pdf',
  ): Promise<SignedUploadResult> {
    const extMap: Record<string, string> = {
      'application/pdf': 'pdf',
      'image/jpeg': 'jpg',
      'image/png': 'png',
    };
    const ext = extMap[contentType] ?? 'pdf';
    const filePath = `workers/${workerId}/${docType}/${uuidv4()}.${ext}`;
    console.log('[GCSStorageService.generateUploadSignedUrl] workerId:', workerId, '| docType:', docType, '| contentType:', contentType, '| filePath:', filePath, '| mockMode:', this.mockMode);

    // Mock mode: return fake URL that frontend can "upload" to
    if (this.mockMode) {
      const mockUrl = `http://localhost:8080/mock-gcs-upload?path=${encodeURIComponent(filePath)}`;
      console.log('[GCSStorageService.generateUploadSignedUrl] MOCK URL generated');
      return { signedUrl: mockUrl, filePath };
    }

    try {
      const file = this.getBucket().file(filePath);

      const [signedUrl] = await file.getSignedUrl({
        version: 'v4',
        action: 'write',
        expires: Date.now() + 15 * 60 * 1000,
        contentType,
      });

      console.log('[GCSStorageService.generateUploadSignedUrl] signed URL generated OK | bucket:', this.bucketName);
      return { signedUrl, filePath };
    } catch (error) {
      console.error('[GCSStorageService.generateUploadSignedUrl] ERROR generating signed URL:', error);
      console.error('[GCSStorageService] Bucket:', this.bucketName);
      console.error('[GCSStorageService] GCP_PROJECT_ID:', process.env.GCP_PROJECT_ID);
      console.error('[GCSStorageService] NODE_ENV:', process.env.NODE_ENV);
      console.error('[GCSStorageService] Note: In Cloud Run, uses Application Default Credentials (ADC) automatically');
      throw new Error(`Failed to generate signed URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async generateViewSignedUrl(filePath: string): Promise<string> {
    // Mock mode: return placeholder URL
    if (this.mockMode) {
      return `http://localhost:8080/mock-gcs-view?path=${encodeURIComponent(filePath)}`;
    }

    try {
      const file = this.getBucket().file(filePath);
      const [signedUrl] = await file.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + 60 * 60 * 1000,
      });
      return signedUrl;
    } catch (error) {
      console.error('[GCSStorageService.generateViewSignedUrl] ERROR:', error);
      throw new Error(`Failed to generate view signed URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
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
