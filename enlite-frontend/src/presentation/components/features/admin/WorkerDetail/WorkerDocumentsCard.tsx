import { useTranslation } from 'react-i18next';
import { Typography } from '@presentation/components/atoms/Typography';
import { ExternalLink } from 'lucide-react';
import type { WorkerDocument } from '@domain/entities/Worker';

interface WorkerDocumentsCardProps {
  documents: WorkerDocument | null;
}

const STATUS_BADGE: Record<string, string> = {
  approved: 'bg-green-100 text-green-700',
  under_review: 'bg-yellow-100 text-yellow-700',
  rejected: 'bg-red-100 text-red-700',
  submitted: 'bg-blue-100 text-blue-700',
  pending: 'bg-gray-100 text-gray-600',
  incomplete: 'bg-gray-100 text-gray-600',
};

interface DocRowProps {
  label: string;
  url: string | null;
  t: (key: string) => string;
}

function DocRow({ label, url, t }: DocRowProps) {
  return (
    <tr className="border-b border-[#D9D9D9] last:border-0">
      <td className="px-3 py-2">{label}</td>
      <td className="px-3 py-2">
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-blue-600 hover:underline text-sm"
          >
            {t('admin.workerDetail.viewDoc')} <ExternalLink className="w-3 h-3" />
          </a>
        ) : (
          <span className="text-[#737373]">—</span>
        )}
      </td>
    </tr>
  );
}

export function WorkerDocumentsCard({ documents }: WorkerDocumentsCardProps) {
  const { t } = useTranslation();

  if (!documents) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <Typography variant="h3" weight="semibold" className="text-[#737373] mb-4">
          {t('admin.workerDetail.documents')}
        </Typography>
        <Typography variant="body" className="text-[#737373]">
          {t('admin.workerDetail.noDocuments')}
        </Typography>
      </div>
    );
  }

  const statusColor = STATUS_BADGE[documents.documentsStatus] ?? STATUS_BADGE.pending;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Typography variant="h3" weight="semibold" className="text-[#737373]">
          {t('admin.workerDetail.documents')}
        </Typography>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColor}`}>
          {documents.documentsStatus}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#EEEEEE] text-[#737373]">
              <th className="text-left px-3 py-2 font-medium rounded-tl-lg">
                {t('admin.workerDetail.docType')}
              </th>
              <th className="text-left px-3 py-2 font-medium rounded-tr-lg">
                {t('admin.workerDetail.docLink')}
              </th>
            </tr>
          </thead>
          <tbody>
            <DocRow label={t('admin.workerDetail.resume')} url={documents.resumeCvUrl} t={t} />
            <DocRow label={t('admin.workerDetail.identityDoc')} url={documents.identityDocumentUrl} t={t} />
            <DocRow label={t('admin.workerDetail.criminalRecord')} url={documents.criminalRecordUrl} t={t} />
            <DocRow label={t('admin.workerDetail.professionalReg')} url={documents.professionalRegistrationUrl} t={t} />
            <DocRow label={t('admin.workerDetail.insurance')} url={documents.liabilityInsuranceUrl} t={t} />
            {documents.additionalCertificatesUrls.map((url, i) => (
              <DocRow
                key={i}
                label={`${t('admin.workerDetail.certificate')} ${i + 1}`}
                url={url}
                t={t}
              />
            ))}
          </tbody>
        </table>
      </div>

      {documents.reviewNotes && (
        <div className="bg-slate-50 rounded-lg p-3">
          <Typography variant="body" className="text-xs text-[#737373] mb-1">
            {t('admin.workerDetail.reviewNotes')}
          </Typography>
          <Typography variant="body" className="text-sm">{documents.reviewNotes}</Typography>
        </div>
      )}
    </div>
  );
}
