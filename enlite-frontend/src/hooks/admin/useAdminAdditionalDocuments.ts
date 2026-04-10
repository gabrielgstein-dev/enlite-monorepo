import { useState, useCallback } from 'react';
import { AdminApiService, AdminAdditionalDocument } from '@infrastructure/http/AdminApiService';

export function useAdminAdditionalDocuments(workerId: string) {
  const [documents, setDocuments] = useState<AdminAdditionalDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchDocuments = useCallback(async () => {
    if (!workerId) return;
    setIsLoading(true);
    try {
      const docs = await AdminApiService.getWorkerAdditionalDocs(workerId);
      setDocuments(docs);
    } finally {
      setIsLoading(false);
    }
  }, [workerId]);

  const uploadDocument = useCallback(async (label: string, file: File) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowed.includes(file.type)) throw new Error('Solo PDF, JPG o PNG');
    if (file.size > 10 * 1024 * 1024) throw new Error('Máximo 10 MB');

    const { signedUrl, filePath } = await AdminApiService.getWorkerAdditionalDocUploadUrl(workerId, file.type);
    await AdminApiService.uploadWorkerDocToGCS(signedUrl, file);
    const saved = await AdminApiService.saveWorkerAdditionalDoc(workerId, label, filePath);
    setDocuments((prev) => [...prev, saved]);
  }, [workerId]);

  const deleteDocument = useCallback(async (id: string) => {
    await AdminApiService.deleteWorkerAdditionalDoc(workerId, id);
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  }, [workerId]);

  const viewDocument = useCallback(async (filePath: string) => {
    const signedUrl = await AdminApiService.getWorkerDocViewUrl(workerId, filePath);
    window.open(signedUrl, '_blank');
  }, [workerId]);

  return { documents, isLoading, fetchDocuments, uploadDocument, deleteDocument, viewDocument };
}
