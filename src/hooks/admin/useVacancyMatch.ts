import { useState, useEffect, useCallback } from 'react';
import { AdminApiService } from '@infrastructure/http/AdminApiService';
import type { MatchResultsResponse, MatchResult, SavedCandidate } from '../../types/match';

interface UseVacancyMatchOptions {
  topN?: number;
  radiusKm?: number;
  excludeActive?: boolean;
}

export function useVacancyMatch(vacancyId: string | undefined) {
  const [results, setResults]       = useState<MatchResultsResponse | null>(null);
  const [isLoading, setIsLoading]   = useState(false);
  const [isRunning, setIsRunning]   = useState(false);
  const [error, setError]           = useState<string | null>(null);

  // Carrega resultados salvos ao montar (sem re-rodar LLM)
  useEffect(() => {
    if (!vacancyId) return;

    let cancelled = false;

    async function fetchSaved() {
      try {
        setIsLoading(true);
        setError(null);
        const data = await AdminApiService.getMatchResults(vacancyId!);
        if (!cancelled) {
          // Se nunca rodou match (sem lastMatchAt e sem candidatos), mantém null
          // para que o componente exiba o estado inicial "Rodar Match"
          setResults(!data.lastMatchAt && data.candidates.length === 0 ? null : data);
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Falha ao carregar resultados de match');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchSaved();
    return () => { cancelled = true; };
  }, [vacancyId]);

  // Dispara novo match completo (lento — chama LLM)
  const runMatch = useCallback(async (options?: UseVacancyMatchOptions) => {
    if (!vacancyId) return;

    try {
      setIsRunning(true);
      setError(null);
      const matchResult: MatchResult = await AdminApiService.triggerMatch(vacancyId, options);

      // Converte ScoredCandidate → SavedCandidate e atualiza state local
      const candidates: SavedCandidate[] = matchResult.candidates.map(c => ({
        workerId:         c.workerId,
        workerName:       c.workerName,
        workerPhone:      c.workerPhone,
        occupation:       c.occupation,
        workZone:         c.workZone,
        distanceKm:       c.distanceKm,
        activeCasesCount: c.activeCasesCount,
        overallStatus:    c.overallStatus,
        matchScore:       c.finalScore,
        internalNotes:    c.llmReasoning,
        applicationStatus: 'under_review',
        alreadyApplied:   c.alreadyApplied,
        messagedAt:       null,
      }));

      setResults(prev => ({
        jobPostingId:     vacancyId,
        lastMatchAt:      new Date().toISOString(),
        totalCandidates:  candidates.length,
        candidates,
        // Preserva messagedAt de resultados anteriores se o worker já estava na lista
        ...(prev ? {
          candidates: candidates.map(c => ({
            ...c,
            messagedAt: prev.candidates.find(p => p.workerId === c.workerId)?.messagedAt ?? null,
          })),
        } : {}),
      }));
    } catch (err: any) {
      setError(err.message || 'Falha ao rodar match');
    } finally {
      setIsRunning(false);
    }
  }, [vacancyId]);

  // Atualiza messagedAt localmente após envio bem-sucedido (evita re-fetch)
  const markMessaged = useCallback((workerId: string, messagedAt: string) => {
    setResults(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        candidates: prev.candidates.map(c =>
          c.workerId === workerId ? { ...c, messagedAt } : c
        ),
      };
    });
  }, []);

  return { results, isLoading, isRunning, error, runMatch, markMessaged };
}
