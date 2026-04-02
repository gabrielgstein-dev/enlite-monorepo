import { useTranslation } from 'react-i18next';
import { Typography } from '@presentation/components/atoms/Typography';
import { FileCheck, FileX, ExternalLink } from 'lucide-react';
import type { WorkerDocument } from '@domain/entities/Worker';

interface WorkerDocumentsCardProps {
  documents: WorkerDocument | null;
}

interface DocumentItem {
  labelKey: string;
  url: string | null;
}

function DocumentUploadCard({ label, url }: { label: string; url: string | null }) {
  const hasDocument = !!url;

  return (
    <div
      className={`relative flex flex-col items-center justify-center gap-4 p-6 h-[142px] rounded-2xl border-[2.5px] transition-colors ${
        hasDocument
          ? 'border-primary'
          : 'border-gray-700'
      }`}
    >
      <div className={`${hasDocument ? 'text-primary' : 'text-gray-700'}`}>
        {hasDocument ? (
          <FileCheck className="w-8 h-10" strokeWidth={1.5} />
        ) : (
          <FileX className="w-8 h-10" strokeWidth={1.5} />
        )}
      </div>
      <p
        className={`font-lexend text-base font-medium text-center leading-snug ${
          hasDocument ? 'text-primary' : 'text-gray-700'
        }`}
      >
        {label}
      </p>

      {hasDocument && url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute top-3 right-3 flex flex-col items-center gap-1 text-primary hover:opacity-70 transition-opacity"
          title="Ver documento"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      )}
    </div>
  );
}

export function WorkerDocumentsCard({ documents }: WorkerDocumentsCardProps) {
  const { t } = useTranslation();

  if (!documents) {
    return (
      <div className="bg-white rounded-card border-2 border-gray-600 p-6 sm:px-8 sm:py-10">
        <Typography variant="h3" weight="semibold" className="text-gray-800 mb-4">
          {t('admin.workerDetail.documents')}
        </Typography>
        <Typography variant="body" className="text-gray-700">
          {t('admin.workerDetail.noDocuments')}
        </Typography>
      </div>
    );
  }

  const statusColor = {
    approved: 'bg-turquoise/20 text-primary',
    under_review: 'bg-wait/20 text-yellow-700',
    rejected: 'bg-cancelled/20 text-red-700',
    submitted: 'bg-blue-100 text-blue-700',
    pending: 'bg-gray-300 text-gray-800',
    incomplete: 'bg-gray-300 text-gray-800',
  }[documents.documentsStatus] ?? 'bg-gray-300 text-gray-800';

  const topRow: DocumentItem[] = [
    { labelKey: 'admin.workerDetail.resume', url: documents.resumeCvUrl },
    { labelKey: 'admin.workerDetail.identityDoc', url: documents.identityDocumentUrl },
    { labelKey: 'admin.workerDetail.criminalRecord', url: documents.criminalRecordUrl },
  ];

  const bottomRow: DocumentItem[] = [
    { labelKey: 'admin.workerDetail.professionalReg', url: documents.professionalRegistrationUrl },
    { labelKey: 'admin.workerDetail.insurance', url: documents.liabilityInsuranceUrl },
  ];

  return (
    <div className="bg-white rounded-card border-2 border-gray-600 p-6 sm:px-8 sm:py-10 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <Typography variant="h3" weight="semibold" className="text-gray-800">
          {t('admin.workerDetail.documents')}
        </Typography>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColor}`}>
          {documents.documentsStatus}
        </span>
      </div>

      {/* Row 1: 3 equal cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {topRow.map((doc) => (
          <DocumentUploadCard key={doc.labelKey} label={t(doc.labelKey)} url={doc.url} />
        ))}
      </div>

      {/* Row 2: 2 wider cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {bottomRow.map((doc) => (
          <DocumentUploadCard key={doc.labelKey} label={t(doc.labelKey)} url={doc.url} />
        ))}
      </div>

      {/* Additional certificates */}
      {documents.additionalCertificatesUrls.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {documents.additionalCertificatesUrls.map((url, i) => (
            <DocumentUploadCard
              key={`cert-${i}`}
              label={`${t('admin.workerDetail.certificate')} ${i + 1}`}
              url={url}
            />
          ))}
        </div>
      )}

      {documents.reviewNotes && (
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
