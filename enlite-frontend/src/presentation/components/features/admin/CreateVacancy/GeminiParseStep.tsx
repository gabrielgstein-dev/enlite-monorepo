import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Typography } from '@presentation/components/atoms/Typography';
import { Sparkles } from 'lucide-react';

export type WorkerType = 'AT' | 'CUIDADOR';

interface GeminiParseStepProps {
  onParsed: (result: {
    vacancy: Record<string, any>;
    prescreening: { questions: any[]; faq: any[] };
    description: { titulo_propuesta: string; descripcion_propuesta: string; perfil_profesional: string };
  }) => void;
  onSkip: () => void;
  onCancel: () => void;
  isParsing: boolean;
  setIsParsing: (v: boolean) => void;
}

export function GeminiParseStep({ onParsed, onSkip, onCancel, isParsing, setIsParsing }: GeminiParseStepProps) {
  const { t } = useTranslation();
  const cc = (k: string) => t(`admin.createVacancy.geminiStep.${k}`);

  const [text, setText] = useState('');
  const [workerType, setWorkerType] = useState<WorkerType>('AT');
  const [error, setError] = useState<string | null>(null);

  const handleParse = async () => {
    if (!text.trim()) return;

    setIsParsing(true);
    setError(null);

    try {
      const { AdminApiService } = await import('@infrastructure/http/AdminApiService');
      const result = await AdminApiService.parseVacancyFromText({ text: text.trim(), workerType });
      onParsed(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsParsing(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-primary" />
        <Typography variant="h3" weight="semibold" className="text-slate-800">
          {cc('title')}
        </Typography>
      </div>

      <Typography variant="body" className="text-slate-500 text-sm">
        {cc('description')}
      </Typography>

      {/* Worker type selector */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-slate-700">{cc('workerTypeLabel')}</label>
        <div className="flex gap-3">
          {(['AT', 'CUIDADOR'] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setWorkerType(type)}
              className={[
                'px-4 py-2 rounded-lg text-sm font-medium border-2 transition-colors',
                workerType === type
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
              ].join(' ')}
            >
              {cc(`workerType_${type}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Text area */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-slate-700">{cc('textLabel')}</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={cc('textPlaceholder')}
          rows={10}
          className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-primary focus:ring-1 focus:ring-primary resize-y"
          disabled={isParsing}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <Typography variant="body" className="text-red-600 text-sm">{error}</Typography>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isParsing}
          className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
        >
          {t('admin.createVacancy.cancel')}
        </button>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onSkip}
            disabled={isParsing}
            className="px-4 py-2 text-sm font-medium text-slate-500 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            {cc('skipButton')}
          </button>
          <button
            type="button"
            onClick={handleParse}
            disabled={isParsing || !text.trim()}
            className="px-6 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isParsing ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {cc('parsing')}
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                {cc('parseButton')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
