import { useState } from 'react';
import { MessageCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { MatchScoreBar } from './MatchScoreBar';
import type { SavedCandidate } from '../../../../../types/match';

interface MatchCandidateRowProps {
  candidate: SavedCandidate;
  rank: number;
  isSelected: boolean;
  onToggleSelect: (workerId: string) => void;
  onSendMessage: (candidate: SavedCandidate) => void;
}

const STATUS_COLORS: Record<string, string> = {
  QUALIFICADO:     'bg-green-100 text-green-700',
  'PRÉ-TALENTUM':  'bg-blue-100 text-blue-700',
  'PRE-TALENTUM':  'bg-blue-100 text-blue-700',
  TALENTUM:        'bg-purple-100 text-purple-700',
  BLACKLIST:       'bg-red-100 text-red-700',
};

function statusColor(status: string | null): string {
  if (!status) return 'bg-gray-100 text-gray-600';
  return STATUS_COLORS[status.toUpperCase()] ?? 'bg-gray-100 text-gray-600';
}

export function MatchCandidateRow({
  candidate,
  rank,
  isSelected,
  onToggleSelect,
  onSendMessage,
}: MatchCandidateRowProps) {
  const [expanded, setExpanded] = useState(false);

  const messagedLabel = candidate.messagedAt
    ? new Date(candidate.messagedAt).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
      })
    : null;

  const distanceLabel = candidate.distanceKm != null
    ? `${candidate.distanceKm.toFixed(1)} km`
    : null;

  const zoneLabel = [candidate.workZone, distanceLabel].filter(Boolean).join(' · ');
  const score = candidate.matchScore ?? 0;

  // Parse strengths and red flags from internalNotes if stored as JSON-like string,
  // otherwise show plain text in expanded section.
  const hasExpansion = !!(candidate.internalNotes);

  return (
    <>
      <tr
        className={`border-b border-[#D9D9D9] hover:bg-gray-50 transition-colors ${
          isSelected ? 'bg-primary/5' : ''
        }`}
      >
        {/* Checkbox */}
        <td className="px-3 py-3 w-10">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(candidate.workerId)}
            className="w-4 h-4 accent-primary cursor-pointer"
          />
        </td>

        {/* Rank */}
        <td className="px-3 py-3 w-10 text-[#737373] text-sm text-center">{rank}</td>

        {/* Nome + badges */}
        <td className="px-3 py-3">
          <div className="flex items-center gap-2">
            <button
              className="text-sm font-medium text-slate-700 hover:text-primary transition-colors text-left"
              onClick={() => hasExpansion && setExpanded(!expanded)}
            >
              {candidate.workerName}
            </button>
            {candidate.alreadyApplied && (
              <span className="px-2 py-0.5 bg-blue-100 text-blue-600 text-xs rounded-full whitespace-nowrap">
                Já candidatou
              </span>
            )}
            {messagedLabel && (
              <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full whitespace-nowrap">
                Notificado {messagedLabel}
              </span>
            )}
          </div>
        </td>

        {/* Status */}
        <td className="px-3 py-3">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(candidate.overallStatus)}`}>
            {candidate.overallStatus ?? '—'}
          </span>
        </td>

        {/* Ocupação */}
        <td className="px-3 py-3 text-sm text-slate-600">{candidate.occupation ?? '—'}</td>

        {/* Zona / Distância */}
        <td className="px-3 py-3 text-sm text-slate-600">{zoneLabel || '—'}</td>

        {/* Casos ativos */}
        <td className="px-3 py-3 text-sm text-center text-slate-600">
          {candidate.activeCasesCount}
        </td>

        {/* Score */}
        <td className="px-3 py-3">
          <MatchScoreBar score={score} />
        </td>

        {/* Ações */}
        <td className="px-3 py-3 w-16">
          <div className="flex items-center gap-1">
            <button
              onClick={() => onSendMessage(candidate)}
              title="Enviar WhatsApp"
              className="p-1.5 rounded-lg text-[#737373] hover:text-green-600 hover:bg-green-50 transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
            </button>
            {hasExpansion && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="p-1.5 rounded-lg text-[#737373] hover:text-primary hover:bg-primary/10 transition-colors"
              >
                {expanded ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
            )}
          </div>
        </td>
      </tr>

      {/* Linha expandida: LLM reasoning */}
      {expanded && candidate.internalNotes && (
        <tr className="border-b border-[#D9D9D9] bg-gray-50">
          <td colSpan={9} className="px-6 py-3">
            <p className="text-sm text-slate-600 italic leading-relaxed">
              {candidate.internalNotes}
            </p>
          </td>
        </tr>
      )}
    </>
  );
}
