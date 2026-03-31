import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DocumentUploadCard } from '@presentation/components/molecules/DocumentUploadCard';
import { Typography } from '@presentation/components/atoms';
import { DocumentType, WorkerDocumentsResponse } from '@infrastructure/http/DocumentApiService';

interface DocumentSlot {
  docType: DocumentType;
  labelKey: string;
  fallbackLabel: string;
}

const DOCUMENT_SLOTS: DocumentSlot[] = [
  { docType: 'resume_cv', labelKey: 'documents.resumeCv', fallbackLabel: 'Curriculum' },
  { docType: 'liability_insurance', labelKey: 'documents.liabilityInsurance', fallbackLabel: 'Certificados y/o Títulos constantes del CV' },
  { docType: 'identity_document', labelKey: 'documents.identity', fallbackLabel: 'DNI - Documento Nacional de Identidade' },
  { docType: 'professional_registration', labelKey: 'documents.professionalReg', fallbackLabel: 'Constancia de Inscripción en ARCA (ex-AFIP)' },
  { docType: 'criminal_record', labelKey: 'documents.criminalRecord', fallbackLabel: 'Antecedentes Penales' },
];

const DOC_URL_MAP: Record<DocumentType, keyof WorkerDocumentsResponse> = {
  resume_cv: 'resumeCvUrl',
  identity_document: 'identityDocumentUrl',
  criminal_record: 'criminalRecordUrl',
  professional_registration: 'professionalRegistrationUrl',
  liability_insurance: 'liabilityInsuranceUrl',
};

interface DocumentsGridProps {
  documents: WorkerDocumentsResponse | null;
  onUpload: (docType: DocumentType, file: File) => Promise<void>;
  onDelete: (docType: DocumentType) => Promise<void>;
  onView: (filePath: string) => Promise<void>;
}

export function DocumentsGrid({ documents, onUpload, onDelete, onView }: DocumentsGridProps): JSX.Element {
  const { t } = useTranslation();
  const [loadingTypes, setLoadingTypes] = useState<Set<DocumentType>>(new Set());
  const [cardErrors, setCardErrors] = useState<Partial<Record<DocumentType, string>>>({});

  const withLoading = async (docType: DocumentType, fn: () => Promise<void>): Promise<void> => {
    setLoadingTypes((prev) => new Set(prev).add(docType));
    setCardErrors((prev) => { const next = { ...prev }; delete next[docType]; return next; });
    try {
      await fn();
    } catch (err) {
      setCardErrors((prev) => ({ ...prev, [docType]: err instanceof Error ? err.message : 'Erro' }));
    } finally {
      setLoadingTypes((prev) => { const next = new Set(prev); next.delete(docType); return next; });
    }
  };

  const getFilePath = (docType: DocumentType): string | null => {
    if (!documents) return null;
    return (documents[DOC_URL_MAP[docType]] as string | null) ?? null;
  };

  const topRow = DOCUMENT_SLOTS.slice(0, 3);
  const bottomRow = DOCUMENT_SLOTS.slice(3);

  const renderCard = (slot: DocumentSlot, className?: string): JSX.Element => {
    const filePath = getFilePath(slot.docType);
    return (
      <div key={slot.docType} data-testid={`doc-slot-${slot.docType}`} className={`flex flex-col gap-1 ${className ?? ''}`}>
        <DocumentUploadCard
          label={t(slot.labelKey, slot.fallbackLabel)}
          isUploaded={!!filePath}
          isLoading={loadingTypes.has(slot.docType)}
          onFileSelect={(file) => withLoading(slot.docType, () => onUpload(slot.docType, file))}
          onDelete={() => withLoading(slot.docType, () => onDelete(slot.docType))}
          onView={() => filePath ? onView(filePath) : Promise.resolve()}
          className="flex-1"
        />
        {cardErrors[slot.docType] && (
          <p className="font-lexend text-xs text-red-500">{cardErrors[slot.docType]}</p>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <Typography variant="h2" weight="semibold" color="secondary">
        {t('documents.title', 'Documentos')}
      </Typography>

      <div className="flex flex-wrap gap-4">
        {topRow.map((slot) => renderCard(slot, 'flex-1 min-w-[200px]'))}
      </div>

      <div className="flex flex-wrap gap-4">
        {bottomRow.map((slot) => renderCard(slot, 'flex-1 min-w-[260px]'))}
      </div>
    </div>
  );
}
