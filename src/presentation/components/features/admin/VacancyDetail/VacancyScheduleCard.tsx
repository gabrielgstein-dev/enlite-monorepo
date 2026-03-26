import { Typography } from '@presentation/components/atoms/Typography';

interface ParsedSchedule {
  days?: string[];
  shifts?: string[];
  interpretation?: string;
}

interface VacancyScheduleCardProps {
  llmParsedSchedule: ParsedSchedule | null;
  scheduleDaysHours: string | null;
  llmEnrichedAt: string | null;
}

function LlmBadge({ enrichedAt }: { enrichedAt: string | null }) {
  if (!enrichedAt) return null;
  const date = new Date(enrichedAt).toLocaleDateString('pt-BR');
  return (
    <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full whitespace-nowrap">
      LLM parseado em {date}
    </span>
  );
}

export function VacancyScheduleCard({
  llmParsedSchedule,
  scheduleDaysHours,
  llmEnrichedAt,
}: VacancyScheduleCardProps) {
  const hasLlm = !!llmParsedSchedule;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Typography variant="h3" weight="semibold" className="text-[#737373]">
          Horário
        </Typography>
        {hasLlm && <LlmBadge enrichedAt={llmEnrichedAt} />}
      </div>

      {scheduleDaysHours && (
        <div>
          <Typography variant="body" className="text-[#737373] text-sm mb-1">Original</Typography>
          <Typography variant="body" className="text-slate-700">{scheduleDaysHours}</Typography>
        </div>
      )}

      {hasLlm ? (
        <div className="flex flex-col gap-2">
          {(llmParsedSchedule!.days?.length ?? 0) > 0 && (
            <div className="flex justify-between items-start">
              <Typography variant="body" className="text-[#737373]">Dias</Typography>
              <div className="flex flex-wrap gap-1 justify-end max-w-[60%]">
                {llmParsedSchedule!.days!.map((d, i) => (
                  <span key={i} className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full">
                    {d}
                  </span>
                ))}
              </div>
            </div>
          )}
          {(llmParsedSchedule!.shifts?.length ?? 0) > 0 && (
            <div className="flex justify-between items-start">
              <Typography variant="body" className="text-[#737373]">Turnos</Typography>
              <div className="flex flex-wrap gap-1 justify-end max-w-[60%]">
                {llmParsedSchedule!.shifts!.map((s, i) => (
                  <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-600 text-xs rounded-full">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}
          {llmParsedSchedule!.interpretation && (
            <div>
              <Typography variant="body" className="text-[#737373] text-sm mb-1">Interpretação</Typography>
              <Typography variant="body" className="text-slate-700 text-sm">
                {llmParsedSchedule!.interpretation}
              </Typography>
            </div>
          )}
        </div>
      ) : (
        !scheduleDaysHours && (
          <Typography variant="body" className="text-[#737373]">—</Typography>
        )
      )}
    </div>
  );
}
