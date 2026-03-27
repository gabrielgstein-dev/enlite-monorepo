interface MatchScoreBarProps {
  score: number;
  structuredScore?: number;
  llmScore?: number | null;
}

function scoreColor(score: number): string {
  if (score >= 70) return 'bg-green-500';
  if (score >= 50) return 'bg-yellow-500';
  return 'bg-red-400';
}

export function MatchScoreBar({ score, structuredScore, llmScore }: MatchScoreBarProps) {
  const pct = Math.min(100, Math.max(0, score));
  const color = scoreColor(score);

  const tooltip =
    structuredScore !== undefined
      ? `Estruturado: ${structuredScore} · LLM: ${llmScore ?? '—'}`
      : undefined;

  return (
    <div className="flex items-center gap-2" title={tooltip}>
      <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-medium text-slate-700 w-8 text-right">{Math.round(score)}</span>
    </div>
  );
}
