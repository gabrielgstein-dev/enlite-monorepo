import { useState, useCallback } from 'react';
import {
  DocumentApiService,
  DocumentType,
  WorkerDocumentsResponse,
} from '@infrastructure/http/DocumentApiService';

interface UseDocumentsApiReturn {
  documents: WorkerDocumentsResponse | null;
  isLoading: boolean;
  error: string | null;
  fetchDocuments: () => Promise<void>;
  uploadDocument: (docType: DocumentType, file: File) => Promise<void>;
  deleteDocument: (docType: DocumentType) => Promise<void>;
  viewDocument: (filePath: string) => Promise<void>;
}

export function useDocumentsApi(): UseDocumentsApiReturn {
  const [documents, setDocuments] = useState<WorkerDocumentsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDocuments = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await DocumentApiService.getDocuments();
      setDocuments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const uploadDocument = useCallback(async (docType: DocumentType, file: File): Promise<void> => {
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowedTypes.includes(file.type)) throw new Error('Only PDF, JPG or PNG files are allowed');
    if (file.size > 10 * 1024 * 1024) throw new Error('File size must be under 10MB');

    const { signedUrl, filePath } = await DocumentApiService.getUploadSignedUrl(docType, file.type);
    await DocumentApiService.uploadFileToGCS(signedUrl, file);
    const updated = await DocumentApiService.saveDocumentPath(docType, filePath);
    setDocuments(updated);
  }, []);

  const deleteDocument = useCallback(async (docType: DocumentType): Promise<void> => {
    await DocumentApiService.deleteDocument(docType);
    await fetchDocuments();
  }, [fetchDocuments]);

  const viewDocument = useCallback(async (filePath: string): Promise<void> => {
    const signedUrl = await DocumentApiService.getViewSignedUrl(filePath);
    window.open(signedUrl, '_blank', 'noopener,noreferrer');
  }, []);

  return { documents, isLoading, error, fetchDocuments, uploadDocument, deleteDocument, viewDocument };
}
