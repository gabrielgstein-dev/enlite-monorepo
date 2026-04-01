import { useTranslation } from 'react-i18next';
import { Typography } from '@presentation/components/atoms/Typography';
import { MapPin, Phone, Star } from 'lucide-react';

interface KanbanCardProps {
  id: string;
  workerName: string | null;
  workerPhone: string | null;
  occupation: string | null;
  workZone: string | null;
  matchScore: number | null;
  talentumStatus: string | null;
  rejectionReasonCategory: string | null;
  interviewDate: string | null;
  interviewTime: string | null;
}

const TALENTUM_STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  INITIATED: { bg: 'bg-slate-100', text: 'text-slate-600' },
  IN_PROGRESS: { bg: 'bg-amber-50', text: 'text-amber-700' },
  COMPLETED: { bg: 'bg-blue-50', text: 'text-blue-700' },
  QUALIFIED: { bg: 'bg-green-50', text: 'text-green-700' },
  IN_DOUBT: { bg: 'bg-orange-50', text: 'text-orange-700' },
  NOT_QUALIFIED: { bg: 'bg-red-50', text: 'text-red-600' },
};

export function KanbanCard({
  workerName,
  workerPhone,
  occupation,
  workZone,
  matchScore,
  talentumStatus,
  rejectionReasonCategory,
  interviewDate,
  interviewTime,
}: KanbanCardProps) {
  const { t } = useTranslation();
  const talentumStyle = talentumStatus ? TALENTUM_STATUS_STYLE[talentumStatus] : null;
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing">
      <div className="flex items-start justify-between gap-2">
        <Typography variant="body" weight="semibold" className="text-[#180149] text-sm truncate">
          {workerName ?? t('admin.kanban.noName')}
        </Typography>
        {matchScore !== null && (
          <div className="flex items-center gap-0.5 shrink-0">
            <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
            <span className="text-xs font-medium text-slate-600">{matchScore}</span>
          </div>
        )}
      </div>

      {occupation && (
        <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700">
          {occupation}
        </span>
      )}

      {talentumStyle && (
        <span data-testid="talentum-badge" className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${talentumStyle.bg} ${talentumStyle.text}`}>
          {t(`admin.kanban.talentumStatus.${talentumStatus}`)}
        </span>
      )}

      <div className="mt-2 flex flex-col gap-1">
        {workerPhone && (
          <div className="flex items-center gap-1 text-slate-500">
            <Phone className="w-3 h-3" />
            <span className="text-xs">{workerPhone}</span>
          </div>
        )}
        {workZone && (
          <div className="flex items-center gap-1 text-slate-500">
            <MapPin className="w-3 h-3" />
            <span className="text-xs">{workZone}</span>
          </div>
        )}
        {interviewDate && (
          <span className="text-[10px] text-slate-400">
            {new Date(interviewDate).toLocaleDateString('es-AR')}
            {interviewTime ? ` ${interviewTime}` : ''}
          </span>
        )}
      </div>

      {rejectionReasonCategory && (
        <div className="mt-2">
          <span data-testid="rejection-badge" className="inline-block px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-50 text-red-600">
            {t(`admin.kanban.rejectionLabels.${rejectionReasonCategory}`, rejectionReasonCategory)}
          </span>
        </div>
      )}
    </div>
  );
}
