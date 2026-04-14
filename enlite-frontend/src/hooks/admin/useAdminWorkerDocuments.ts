import { useState, useCallback } from 'react';
import { AdminApiService } from '@infrastructure/http/AdminApiService';

export type AdminDocumentType =
  | 'resume_cv'
  | 'identity_document'
  | 'identity_document_back'
  | 'criminal_record'
  | 'professional_registration'
  | 'liability_insurance'
  | 'monotributo_certificate'
  | 'at_certificate';

export function useAdminWorkerDocuments(workerId: string, onSuccess?: () => void) {
  const [loadingTypes, setLoadingTypes] = useState<Set<AdminDocumentType>>(new Set());
  const [errors, setErrors] = useState<Partial<Record<AdminDocumentType, string>>>({});

  const clearError = useCallback((docType: AdminDocumentType) => {
    setErrors((prev) => { const next = { ...prev }; delete next[docType]; return next; });
  }, []);

  const withLoading = useCallback(async (docType: AdminDocumentType, fn: () => Promise<void>) => {
    setLoadingTypes((prev) => new Set(prev).add(docType));
    clearError(docType);
    try {
      await fn();
      onSuccess?.();
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [docType]: err instanceof Error ? err.message : 'Error',
      }));
    } finally {
      setLoadingTypes((prev) => { const next = new Set(prev); next.delete(docType); return next; });
    }
  }, [clearError, onSuccess]);

  const uploadDocument = useCallback(async (docType: AdminDocumentType, file: File) => {
    await withLoading(docType, async () => {
      const { signedUrl, filePath } = await AdminApiService.getWorkerDocUploadUrl(
        workerId, docType, file.type,
      );
      await AdminApiService.uploadWorkerDocToGCS(signedUrl, file);
      await AdminApiService.saveWorkerDocPath(workerId, docType, filePath);
    });
  }, [workerId, withLoading]);

  const deleteDocument = useCallback(async (docType: AdminDocumentType) => {
    await withLoading(docType, async () => {
      await AdminApiService.deleteWorkerDoc(workerId, docType);
    });
  }, [workerId, withLoading]);

  const viewDocument = useCallback(async (filePath: string) => {
    const signedUrl = await AdminApiService.getWorkerDocViewUrl(workerId, filePath);
    window.open(signedUrl, '_blank');
  }, [workerId]);

  const validateDocument = useCallback(async (docType: AdminDocumentType) => {
    await withLoading(docType, async () => {
      await AdminApiService.validateWorkerDoc(workerId, docType);
    });
  }, [workerId, withLoading]);

  const invalidateDocument = useCallback(async (docType: AdminDocumentType) => {
    await withLoading(docType, async () => {
      await AdminApiService.invalidateWorkerDoc(workerId, docType);
    });
  }, [workerId, withLoading]);

  return { uploadDocument, deleteDocument, viewDocument, validateDocument, invalidateDocument, loadingTypes, errors };
}
