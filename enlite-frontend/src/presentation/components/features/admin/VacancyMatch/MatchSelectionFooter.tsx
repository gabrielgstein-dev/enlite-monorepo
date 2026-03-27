import { MessageCircle, X } from 'lucide-react';
import { Button } from '@presentation/components/atoms/Button';
import { Typography } from '@presentation/components/atoms/Typography';

interface MatchSelectionFooterProps {
  selectedCount: number;
  onSendBatch: () => void;
  onClearSelection: () => void;
}

export function MatchSelectionFooter({
  selectedCount,
  onSendBatch,
  onClearSelection,
}: MatchSelectionFooterProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-center">
      <div className="bg-white border border-[#D9D9D9] rounded-t-2xl shadow-lg px-8 py-4 flex items-center gap-6">
        <Typography variant="body" weight="semibold" className="text-slate-700">
          {selectedCount} worker{selectedCount !== 1 ? 's' : ''} selecionado{selectedCount !== 1 ? 's' : ''}
        </Typography>
        <Button
          variant="primary"
          size="sm"
          onClick={onSendBatch}
          className="flex items-center gap-2"
        >
          <MessageCircle className="w-4 h-4" />
          Enviar WhatsApp
        </Button>
        <button
          onClick={onClearSelection}
          className="flex items-center gap-1 text-[#737373] hover:text-red-500 transition-colors text-sm"
        >
          <X className="w-4 h-4" />
          Limpar seleção
        </button>
      </div>
    </div>
  );
}
