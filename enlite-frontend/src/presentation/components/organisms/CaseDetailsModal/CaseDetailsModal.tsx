import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Button } from '@presentation/components/atoms/Button';
import { Typography } from '@presentation/components/atoms/Typography';

interface CaseDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseData: any;
}

export function CaseDetailsModal({ isOpen, onClose, caseData }: CaseDetailsModalProps): JSX.Element | null {
  const { t } = useTranslation();

  if (!isOpen || !caseData) return null;

  const { caseInfo, metrics, publicationsHistory } = caseData;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={onClose}>
      <div 
        className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto m-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <Typography variant="h2" weight="semibold">
            {t('admin.recruitment.caseDetails')} {caseInfo?.case_number}
          </Typography>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Typography variant="body" weight="semibold" className="text-gray-600">
                {t('admin.recruitment.status')}
              </Typography>
              <Typography variant="body">{caseInfo?.clickup_status || '-'}</Typography>
            </div>
            <div>
              <Typography variant="body" weight="semibold" className="text-gray-600">
                {t('admin.recruitment.priority')}
              </Typography>
              <Typography variant="body">{caseInfo?.clickup_priority || '-'}</Typography>
            </div>
            <div>
              <Typography variant="body" weight="semibold" className="text-gray-600">
                {t('admin.recruitment.diagnosis')}
              </Typography>
              <Typography variant="body">{caseInfo?.diagnosis || '-'}</Typography>
            </div>
            <div>
              <Typography variant="body" weight="semibold" className="text-gray-600">
                {t('admin.recruitment.zone')}
              </Typography>
              <Typography variant="body">{caseInfo?.patient_zone || '-'}</Typography>
            </div>
          </div>

          <div>
            <Typography variant="h3" weight="semibold" className="mb-3">
              {t('admin.recruitment.metrics')}
            </Typography>
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <Typography variant="body" className="text-gray-600 text-sm">
                  {t('admin.recruitment.postulados')}
                </Typography>
                <Typography variant="h2" weight="bold" className="text-blue-600">
                  {metrics?.postuladosInTalentum || 0}
                </Typography>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <Typography variant="body" className="text-gray-600 text-sm">
                  {t('admin.recruitment.seleccionados')}
                </Typography>
                <Typography variant="h2" weight="bold" className="text-green-600">
                  {metrics?.seleccionados || 0}
                </Typography>
              </div>
              <div className="bg-yellow-50 p-4 rounded-lg">
                <Typography variant="body" className="text-gray-600 text-sm">
                  {t('admin.recruitment.reemplazos')}
                </Typography>
                <Typography variant="h2" weight="bold" className="text-yellow-600">
                  {metrics?.reemplazos || 0}
                </Typography>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <Typography variant="body" className="text-gray-600 text-sm">
                  {t('admin.recruitment.invitados')}
                </Typography>
                <Typography variant="h2" weight="bold" className="text-purple-600">
                  {metrics?.invitados || 0}
                </Typography>
              </div>
            </div>
          </div>

          {publicationsHistory && publicationsHistory.length > 0 && (
            <div>
              <Typography variant="h3" weight="semibold" className="mb-3">
                {t('admin.recruitment.publicationsHistory')}
              </Typography>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {publicationsHistory.map((pub: any, idx: number) => (
                  <div key={idx} className="border-l-4 border-blue-500 pl-4 py-2">
                    <div className="flex justify-between">
                      <Typography variant="body" weight="semibold">{pub.channel}</Typography>
                      <Typography variant="body" className="text-gray-500 text-sm">
                        {new Date(pub.published_at).toLocaleDateString()}
                      </Typography>
                    </div>
                    {pub.recruiter_name && (
                      <Typography variant="body" className="text-gray-600 text-sm">
                        {pub.recruiter_name}
                      </Typography>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-gray-50 px-6 py-4 border-t flex justify-end">
          <Button variant="outline" onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
      </div>
    </div>
  );
}
