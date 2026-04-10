import { useState, useCallback } from 'react';
import {
  DocumentApiService,
  AdditionalDocument,
} from '@infrastructure/http/DocumentApiService';

interface UseAdditionalDocumentsApiReturn {
  documents: AdditionalDocument[];
  isLoading: boolean;
  error: string | null;
  fetchDocuments: () => Promise<void>;
  uploadDocument: (label: string, file: File) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  viewDocument: (filePath: string) => Promise<void>;
}

export function useAdditionalDocumentsApi(): UseAdditionalDocumentsApiReturn {
  const [documents, setDocuments] = useState<AdditionalDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDocuments = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await DocumentApiService.getAdditionalDocuments();
      setDocuments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading documents');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const uploadDocument = useCallback(async (label: string, file: File): Promise<void> => {
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowedTypes.includes(file.type)) throw new Error('Only PDF, JPG or PNG files are allowed');
    if (file.size > 10 * 1024 * 1024) throw new Error('File size must be under 10MB');

    const { signedUrl, filePath } = await DocumentApiService.getAdditionalDocUploadUrl(file.type);
    await DocumentApiService.uploadFileToGCS(signedUrl, file);
    await DocumentApiService.saveAdditionalDocument(label, filePath);
    await fetchDocuments();
  }, [fetchDocuments]);

  const deleteDocument = useCallback(async (id: string): Promise<void> => {
    await DocumentApiService.deleteAdditionalDocument(id);
    await fetchDocuments();
  }, [fetchDocuments]);

  const viewDocument = useCallback(async (filePath: string): Promise<void> => {
    const signedUrl = await DocumentApiService.getViewSignedUrl(filePath);
    window.open(signedUrl, '_blank', 'noopener,noreferrer');
  }, []);

  return { documents, isLoading, error, fetchDocuments, uploadDocument, deleteDocument, viewDocument };
}
