import { useEffect } from 'react';
import { useDocumentsApi } from '@presentation/hooks/useDocumentsApi';
import { DocumentsGrid } from '@presentation/components/organisms/DocumentsGrid';
import { DocumentType } from '@infrastructure/http/DocumentApiService';

export function DocumentsTab(): JSX.Element {
  const { documents, isLoading, error, fetchDocuments, uploadDocument, deleteDocument, viewDocument } =
    useDocumentsApi();

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  if (isLoading && !documents) {
    return (
      <div className="animate-pulse flex flex-col gap-4">
        <div className="h-8 bg-gray-300 rounded-input w-48" />
        <div className="flex gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="flex-1 h-36 bg-gray-300 rounded-card" />)}
        </div>
        <div className="flex gap-4">
          {[1, 2].map((i) => <div key={i} className="flex-1 h-36 bg-gray-300 rounded-card" />)}
        </div>
      </div>
    );
  }

  if (error && !documents) {
    return (
      <div className="p-4 rounded-input bg-red-50 border border-red-200">
        <p className="font-lexend text-sm text-red-700">{error}</p>
      </div>
    );
  }

  return (
    <DocumentsGrid
      documents={documents}
      onUpload={(docType: DocumentType, file: File) => uploadDocument(docType, file)}
      onDelete={(docType: DocumentType) => deleteDocument(docType)}
      onView={(filePath: string) => viewDocument(filePath)}
    />
  );
}
