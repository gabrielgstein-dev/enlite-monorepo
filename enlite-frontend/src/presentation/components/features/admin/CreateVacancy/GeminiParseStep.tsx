import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Typography } from '@presentation/components/atoms/Typography';
import { FileUp, Sparkles, Type, X } from 'lucide-react';
import type {
  AddressMatchCandidate,
  PatientFieldClash,
  ParsedVacancyResult,
} from '@domain/entities/PatientAddress';

export type WorkerType = 'AT' | 'CUIDADOR';
type InputMode = 'text' | 'pdf';

const MAX_PDF_SIZE = 20 * 1024 * 1024; // 20 MB

/** Result passed to onParsed.
 * - PDF mode: full result with addressMatches + fieldClashes from /parse
 * - Text mode: legacy shape, addressMatches=[] and fieldClashes=[] (steps 1&2 are skipped)
 */
export interface GeminiParseResult {
  parsed: ParsedVacancyResult;
  addressMatches: AddressMatchCandidate[];
  fieldClashes: PatientFieldClash[];
  patientId: string | null;
}

interface GeminiParseStepProps {
  onParsed: (result: GeminiParseResult) => void;
  onSkip: () => void;
  onCancel: () => void;
  isParsing: boolean;
  setIsParsing: (v: boolean) => void;
}

export function GeminiParseStep({ onParsed, onSkip, onCancel, isParsing, setIsParsing }: GeminiParseStepProps) {
  const { t } = useTranslation();
  const cc = (k: string) => t(`admin.createVacancy.geminiStep.${k}`);

  const [inputMode, setInputMode] = useState<InputMode>('text');
  const [text, setText] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [workerType, setWorkerType] = useState<WorkerType>('AT');
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validatePdf = (file: File): string | null => {
    if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) return cc('pdfTypeError');
    if (file.size > MAX_PDF_SIZE) return cc('pdfSizeError');
    return null;
  };

  const handleFileSelect = (file: File | undefined) => {
    if (!file) return;
    const validationError = validatePdf(file);
    if (validationError) {
      setError(validationError);
      setPdfFile(null);
      return;
    }
    setError(null);
    setPdfFile(file);
  };

  const canParse = inputMode === 'text' ? !!text.trim() : !!pdfFile;

  const handleParse = async () => {
    if (!canParse) return;

    setIsParsing(true);
    setError(null);

    try {
      const { AdminApiService } = await import('@infrastructure/http/AdminApiService');

      if (inputMode === 'text') {
        // Text mode: use legacy endpoint, no address/clash data
        const legacy = await AdminApiService.parseVacancyFromText({ text: text.trim(), workerType });
        onParsed({
          parsed: legacy as ParsedVacancyResult,
          addressMatches: [],
          fieldClashes: [],
          patientId: null,
        });
      } else {
        // PDF mode: use new /parse endpoint that returns full result
        const full = await AdminApiService.parseVacancyFull(pdfFile!, workerType);
        onParsed(full);
      }
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

      {/* Input mode tabs */}
      <div className="flex border-b border-slate-200">
        <button
          type="button"
          onClick={() => setInputMode('text')}
          className={[
            'flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            inputMode === 'text'
              ? 'border-primary text-primary'
              : 'border-transparent text-slate-500 hover:text-slate-700',
          ].join(' ')}
        >
          <Type className="w-4 h-4" />
          {cc('inputModeText')}
        </button>
        <button
          type="button"
          onClick={() => setInputMode('pdf')}
          className={[
            'flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            inputMode === 'pdf'
              ? 'border-primary text-primary'
              : 'border-transparent text-slate-500 hover:text-slate-700',
          ].join(' ')}
        >
          <FileUp className="w-4 h-4" />
          {cc('inputModePdf')}
        </button>
      </div>

      {/* Text area (text mode) */}
      {inputMode === 'text' && (
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
      )}

      {/* PDF upload (pdf mode) */}
      {inputMode === 'pdf' && (
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-700">{cc('pdfLabel')}</label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files?.[0])}
            disabled={isParsing}
          />
          {pdfFile ? (
            <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
              <FileUp className="w-5 h-5 text-primary shrink-0" />
              <span className="text-sm text-slate-700 truncate flex-1">{pdfFile.name}</span>
              <span className="text-xs text-slate-400">{(pdfFile.size / 1024 / 1024).toFixed(1)} MB</span>
              <button
                type="button"
                onClick={() => { setPdfFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                className="text-slate-400 hover:text-slate-600"
                disabled={isParsing}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); handleFileSelect(e.dataTransfer.files[0]); }}
              disabled={isParsing}
              className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-4 py-10 text-slate-400 hover:border-primary hover:text-primary transition-colors"
            >
              <FileUp className="w-8 h-8" />
              <span className="text-sm">{cc('pdfPlaceholder')}</span>
            </button>
          )}
        </div>
      )}

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
            disabled={isParsing || !canParse}
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
