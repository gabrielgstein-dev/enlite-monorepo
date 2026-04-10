import { useTranslation } from 'react-i18next';
import { Typography } from '@presentation/components/atoms/Typography';
import { DocumentUploadCard } from '@presentation/components/molecules/DocumentUploadCard';
import { AlertTriangle } from 'lucide-react';
import type { WorkerDocument } from '@domain/entities/Worker';
import type { AdminDocumentType } from '@hooks/admin/useAdminWorkerDocuments';

interface DocumentSlot {
  docType: AdminDocumentType;
  labelKey: string;
  urlField: keyof WorkerDocument;
  atOnly?: boolean;
}

const DOCUMENT_SLOTS: DocumentSlot[] = [
  { docType: 'resume_cv', labelKey: 'admin.workerDetail.resume', urlField: 'resumeCvUrl' },
  { docType: 'identity_document', labelKey: 'admin.workerDetail.identityDoc', urlField: 'identityDocumentUrl' },
  { docType: 'identity_document_back', labelKey: 'admin.workerDetail.identityDocBack', urlField: 'identityDocumentBackUrl' },
  { docType: 'criminal_record', labelKey: 'admin.workerDetail.criminalRecord', urlField: 'criminalRecordUrl' },
  { docType: 'professional_registration', labelKey: 'admin.workerDetail.professionalReg', urlField: 'professionalRegistrationUrl' },
  { docType: 'liability_insurance', labelKey: 'admin.workerDetail.insurance', urlField: 'liabilityInsuranceUrl' },
  { docType: 'monotributo_certificate', labelKey: 'admin.workerDetail.monotributo', urlField: 'monotributoCertificateUrl', atOnly: true },
  { docType: 'at_certificate', labelKey: 'admin.workerDetail.atCertificate', urlField: 'atCertificateUrl', atOnly: true },
];

interface WorkerDocumentsCardProps {
  documents: WorkerDocument | null;
  profession?: string | null;
  onUpload: (docType: AdminDocumentType, file: File) => Promise<void>;
  onDelete: (docType: AdminDocumentType) => Promise<void>;
  onView: (filePath: string) => Promise<void>;
  loadingTypes: Set<AdminDocumentType>;
  errors: Partial<Record<AdminDocumentType, string>>;
}

export function WorkerDocumentsCard({
  documents, profession, onUpload, onDelete, onView, loadingTypes, errors,
}: WorkerDocumentsCardProps) {
  const { t } = useTranslation();
  const isAT = profession === 'AT';
  const visibleSlots = DOCUMENT_SLOTS.filter((s) => !s.atOnly || isAT);

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

  const row1 = visibleSlots.slice(0, 3);
  const row2 = visibleSlots.slice(3, 6);
  const row3 = visibleSlots.slice(6);

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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {row1.map(renderCard)}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {row2.map(renderCard)}
      </div>

      {row3.length > 0 && (
        <>
          {isAT && (
            <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200">
              <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="font-lexend text-sm text-amber-800">
                {t('documents.atRequiredWarning', 'Como Acompañante Terapéutico, estos documentos son obligatorios para completar tu registro.')}
              </p>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {row3.map(renderCard)}
          </div>
        </>
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
