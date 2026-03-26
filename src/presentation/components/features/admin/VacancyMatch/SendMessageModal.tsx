import { useEffect, useState } from 'react';
import { Loader2, ChevronDown } from 'lucide-react';
import { Typography } from '@presentation/components/atoms/Typography';
import { Button } from '@presentation/components/atoms/Button';
import { useMatchMessaging } from '@hooks/admin/useMatchMessaging';
import type { SavedCandidate, MessageTemplate } from '../../../../../types/match';

interface SendMessageModalProps {
  candidates: SavedCandidate[];
  vacancy: any;
  vacancyId: string;
  onClose: () => void;
  onMessaged: (workerId: string, messagedAt: string) => void;
}

// Preenche as variáveis do template com dados reais do candidato e da vaga
function buildVariables(
  candidate: SavedCandidate,
  vacancy: any,
): Record<string, string> {
  const role =
    (vacancy?.llm_required_profession as string[] | null)?.[0] ??
    vacancy?.title ??
    '';
  const location = vacancy?.patient_zone ?? vacancy?.title ?? '';
  return { name: candidate.workerName, role, location };
}

// Substitui {{var}} por valores reais para o preview
function renderPreview(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

export function SendMessageModal({
  candidates,
  vacancy,
  vacancyId,
  onClose,
  onMessaged,
}: SendMessageModalProps) {
  const {
    templates,
    isLoadingTemplates,
    isSending,
    progress,
    fetchTemplates,
    sendBatch,
    resetProgress,
  } = useMatchMessaging(vacancyId);

  const [selectedSlug, setSelectedSlug] = useState('vacancy_match');
  const [showConfirmRenotify, setShowConfirmRenotify] = useState(false);

  // Carrega templates ao abrir
  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // Seleciona automaticamente vacancy_match quando os templates carregarem
  useEffect(() => {
    if (templates.length > 0 && !templates.find(t => t.slug === selectedSlug)) {
      setSelectedSlug(templates[0].slug);
    }
  }, [templates, selectedSlug]);

  const selectedTemplate: MessageTemplate | undefined = templates.find(
    t => t.slug === selectedSlug,
  );

  const alreadyNotified = candidates.filter(c => c.messagedAt != null);
  const notYetNotified = candidates.filter(c => c.messagedAt == null);

  const started = progress.length > 0;
  const done = started && !isSending;
  const sentCount = progress.filter(p => p.status === 'sent').length;
  const errorCount = progress.filter(p => p.status === 'error').length;

  const handleConfirmSend = () => {
    if (alreadyNotified.length > 0 && !showConfirmRenotify) {
      setShowConfirmRenotify(true);
      return;
    }
    doSend();
  };

  const doSend = (subset?: SavedCandidate[]) => {
    sendBatch(
      subset ?? candidates,
      selectedSlug,
      (c) => buildVariables(c, vacancy),
      onMessaged,
    );
  };

  const handleClose = () => {
    resetProgress();
    setShowConfirmRenotify(false);
    onClose();
  };

  // ── Preview sample: usa o primeiro candidato como exemplo ──────────────
  const previewVars = candidates[0]
    ? buildVariables(candidates[0], vacancy)
    : { name: '…', role: '…', location: '…' };
  const previewText = selectedTemplate
    ? renderPreview(selectedTemplate.body, previewVars)
    : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Typography variant="h3" weight="semibold" className="text-[#737373] font-poppins">
            Enviar WhatsApp
          </Typography>
          <button
            onClick={handleClose}
            className="text-[#737373] hover:text-red-500 transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Estado: antes de enviar */}
        {!started && (
          <>
            {/* Seleção de template */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-700">Template</label>
              {isLoadingTemplates ? (
                <div className="flex items-center gap-2 text-sm text-[#737373]">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Carregando templates…
                </div>
              ) : (
                <div className="relative">
                  <select
                    value={selectedSlug}
                    onChange={e => setSelectedSlug(e.target.value)}
                    className="w-full appearance-none border border-[#D9D9D9] rounded-lg px-3 py-2 text-sm text-slate-700 bg-white pr-8 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    {templates.map(t => (
                      <option key={t.slug} value={t.slug}>
                        {t.name} ({t.slug})
                      </option>
                    ))}
                    {templates.length === 0 && (
                      <option value="vacancy_match">vacancy_match (padrão)</option>
                    )}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#737373] pointer-events-none" />
                </div>
              )}
            </div>

            {/* Preview */}
            {selectedTemplate && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-700">
                  Preview{candidates.length > 1 && (
                    <span className="font-normal text-[#737373]"> (para {candidates[0]?.workerName})</span>
                  )}
                </label>
                <div className="bg-[#F5F5F5] rounded-xl px-4 py-3 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed border border-[#D9D9D9]">
                  {previewText}
                </div>
              </div>
            )}

            {/* Resumo dos destinatários */}
            <div className="text-sm text-slate-600">
              {candidates.length === 1 ? (
                <>Enviar para <strong>{candidates[0].workerName}</strong>.</>
              ) : (
                <>{candidates.length} workers selecionados.</>
              )}
              {alreadyNotified.length > 0 && (
                <span className="ml-1 text-amber-700">
                  {alreadyNotified.length} já notificado{alreadyNotified.length !== 1 ? 's' : ''}.
                </span>
              )}
            </div>

            {/* Confirmação de re-notificação */}
            {showConfirmRenotify && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                <strong>{alreadyNotified.length}</strong> worker{alreadyNotified.length !== 1 ? 's' : ''} já recebeu esta mensagem.
                {notYetNotified.length > 0 && (
                  <span> {notYetNotified.length} ainda não recebeu.</span>
                )}
                <span> Deseja re-enviar para todos mesmo assim?</span>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Button variant="outline" size="sm" onClick={handleClose}>
                Cancelar
              </Button>
              {showConfirmRenotify ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setShowConfirmRenotify(false); doSend(notYetNotified); }}
                    className="border-amber-300 text-amber-700 hover:bg-amber-50"
                  >
                    Só novos ({notYetNotified.length})
                  </Button>
                  <Button variant="primary" size="sm" onClick={() => doSend()}>
                    Re-enviar para todos
                  </Button>
                </>
              ) : (
                <Button variant="primary" size="sm" onClick={handleConfirmSend}>
                  Confirmar envio
                </Button>
              )}
            </div>
          </>
        )}

        {/* Estado: progresso de envio */}
        {started && (
          <div className="flex flex-col gap-2">
            {progress.map(p => (
              <div key={p.workerId} className="flex items-center justify-between text-sm">
                <span className="text-slate-700">{p.workerName}</span>
                <span
                  className={
                    p.status === 'sent'
                      ? 'text-green-600'
                      : p.status === 'error'
                      ? 'text-red-500'
                      : p.status === 'sending'
                      ? 'text-primary animate-pulse'
                      : 'text-[#737373]'
                  }
                >
                  {p.status === 'sent'
                    ? '✓ enviado'
                    : p.status === 'error'
                    ? `✗ ${p.error ?? 'erro'}`
                    : p.status === 'sending'
                    ? '…enviando'
                    : 'aguardando'}
                </span>
              </div>
            ))}

            {isSending && (
              <div className="flex items-center gap-2 text-primary text-sm mt-1">
                <Loader2 className="w-4 h-4 animate-spin" />
                Enviando…
              </div>
            )}

            {done && (
              <div className="mt-2 pt-3 border-t border-[#D9D9D9] flex items-center justify-between">
                <Typography variant="body" weight="medium" className="text-slate-700">
                  Concluído: {sentCount} enviado{sentCount !== 1 ? 's' : ''},&nbsp;
                  {errorCount} falha{errorCount !== 1 ? 's' : ''}
                </Typography>
                <Button variant="outline" size="sm" onClick={handleClose}>
                  Fechar
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
