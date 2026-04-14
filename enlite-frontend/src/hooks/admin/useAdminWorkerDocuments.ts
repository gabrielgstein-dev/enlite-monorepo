import { useState, useCallback, useMemo } from 'react';
import { AdminApiService } from '@infrastructure/http/AdminApiService';
import type { DocumentValidations } from '@domain/entities/Worker';

export type AdminDocumentType =
  | 'resume_cv'
  | 'identity_document'
  | 'identity_document_back'
  | 'criminal_record'
  | 'professional_registration'
  | 'liability_insurance'
  | 'monotributo_certificate'
  | 'at_certificate';

interface UseAdminWorkerDocumentsOptions {
  onSuccess?: () => void;
  onValidationChange?: (validations: DocumentValidations) => void;
}

export function useAdminWorkerDocuments(
  workerId: string,
  options: UseAdminWorkerDocumentsOptions | (() => void) = {},
) {
  // Support legacy signature: useAdminWorkerDocuments(id, refetch)
  const opts = useMemo<UseAdminWorkerDocumentsOptions>(
    () => (typeof options === 'function' ? { onSuccess: options } : options),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [typeof options === 'function' ? options : options.onSuccess, typeof options === 'function' ? undefined : options.onValidationChange],
  );

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
      opts.onSuccess?.();
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [docType]: err instanceof Error ? err.message : 'Error',
      }));
    } finally {
      setLoadingTypes((prev) => { const next = new Set(prev); next.delete(docType); return next; });
    }
  }, [clearError, opts]);

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
    setLoadingTypes((prev) => new Set(prev).add(docType));
    clearError(docType);
    try {
      const validations = await AdminApiService.validateWorkerDoc(workerId, docType);
      opts.onValidationChange?.(validations);
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [docType]: err instanceof Error ? err.message : 'Error',
      }));
    } finally {
      setLoadingTypes((prev) => { const next = new Set(prev); next.delete(docType); return next; });
    }
  }, [workerId, clearError, opts]);

  const invalidateDocument = useCallback(async (docType: AdminDocumentType) => {
    setLoadingTypes((prev) => new Set(prev).add(docType));
    clearError(docType);
    try {
      const validations = await AdminApiService.invalidateWorkerDoc(workerId, docType);
      opts.onValidationChange?.(validations);
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [docType]: err instanceof Error ? err.message : 'Error',
      }));
    } finally {
      setLoadingTypes((prev) => { const next = new Set(prev); next.delete(docType); return next; });
    }
  }, [workerId, clearError, opts]);

  return { uploadDocument, deleteDocument, viewDocument, validateDocument, invalidateDocument, loadingTypes, errors };
}
