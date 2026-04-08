import { useTranslation } from 'react-i18next';
import { Typography } from '@presentation/components/atoms/Typography';
import { DocumentUploadCard } from '@presentation/components/molecules/DocumentUploadCard';
import type { WorkerDocument } from '@domain/entities/Worker';
import type { AdminDocumentType } from '@hooks/admin/useAdminWorkerDocuments';

interface DocumentSlot {
  docType: AdminDocumentType;
  labelKey: string;
  urlField: keyof WorkerDocument;
}

const DOCUMENT_SLOTS: DocumentSlot[] = [
  { docType: 'resume_cv', labelKey: 'admin.workerDetail.resume', urlField: 'resumeCvUrl' },
  { docType: 'identity_document', labelKey: 'admin.workerDetail.identityDoc', urlField: 'identityDocumentUrl' },
  { docType: 'criminal_record', labelKey: 'admin.workerDetail.criminalRecord', urlField: 'criminalRecordUrl' },
  { docType: 'professional_registration', labelKey: 'admin.workerDetail.professionalReg', urlField: 'professionalRegistrationUrl' },
  { docType: 'liability_insurance', labelKey: 'admin.workerDetail.insurance', urlField: 'liabilityInsuranceUrl' },
];

interface WorkerDocumentsCardProps {
  documents: WorkerDocument | null;
  onUpload: (docType: AdminDocumentType, file: File) => Promise<void>;
  onDelete: (docType: AdminDocumentType) => Promise<void>;
  onView: (filePath: string) => Promise<void>;
  loadingTypes: Set<AdminDocumentType>;
  errors: Partial<Record<AdminDocumentType, string>>;
}

export function WorkerDocumentsCard({
  documents, onUpload, onDelete, onView, loadingTypes, errors,
}: WorkerDocumentsCardProps) {
  const { t } = useTranslation();

  const statusColor = documents ? ({
    approved: 'bg-turquoise/20 text-primary',
    under_review: 'bg-wait/20 text-yellow-700',
    rejected: 'bg-cancelled/20 text-red-700',
    submitted: 'bg-blue-100 text-blue-700',
    pending: 'bg-gray-300 text-gray-800',
    incomplete: 'bg-gray-300 text-gray-800',
  }[documents.documentsStatus] ?? 'bg-gray-300 text-gray-800') : null;

  const getUrl = (slot: DocumentSlot): string | null => {
    if (!documents) return null;
    return (documents[slot.urlField] as string | null) ?? null;
  };

  const topRow = DOCUMENT_SLOTS.slice(0, 3);
  const bottomRow = DOCUMENT_SLOTS.slice(3);

  const renderCard = (slot: DocumentSlot) => {
    const filePath = getUrl(slot);
    return (
      <div key={slot.docType} className="flex flex-col gap-1">
        <DocumentUploadCard
          label={t(slot.labelKey)}
          isUploaded={!!filePath}
          isLoading={loadingTypes.has(slot.docType)}
          onFileSelect={(file) => onUpload(slot.docType, file)}
          onDelete={() => onDelete(slot.docType)}
          onView={() => filePath ? onView(filePath) : Promise.resolve()}
        />
        {errors[slot.docType] && (
          <p className="font-lexend text-xs text-red-500">{errors[slot.docType]}</p>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-card border-2 border-gray-600 p-6 sm:px-8 sm:py-10 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <Typography variant="h1" weight="semibold" as="h3">
          {t('admin.workerDetail.documents')}
        </Typography>
        {statusColor && documents && (
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColor}`}>
            {documents.documentsStatus}
          </span>
        )}
      </div>

      <Typography variant="body" className="text-gray-700 text-sm">
        {t('admin.workerDetail.documentsAdminHint')}
      </Typography>

      {/* Row 1: 3 cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {topRow.map(renderCard)}
      </div>

      {/* Row 2: 2 cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {bottomRow.map(renderCard)}
      </div>

      {/* Additional certificates */}
      {documents && documents.additionalCertificatesUrls.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {documents.additionalCertificatesUrls.map((url, i) => (
            <div key={`cert-${i}`} className="flex flex-col gap-1">
              <DocumentUploadCard
                label={`${t('admin.workerDetail.certificate')} ${i + 1}`}
                isUploaded={!!url}
                isLoading={false}
                onFileSelect={() => {}}
                onDelete={() => Promise.resolve()}
                onView={() => url ? onView(url) : Promise.resolve()}
              />
            </div>
          ))}
        </div>
      )}

      {documents?.reviewNotes && (
        <div className="bg-gray-200 rounded-lg p-3">
          <Typography variant="body" className="text-xs text-gray-800 mb-1">
            {t('admin.workerDetail.reviewNotes')}
          </Typography>
          <Typography variant="body" className="text-sm">{documents.reviewNotes}</Typography>
        </div>
      )}
    </div>
  );
}
