import { useState, useEffect, useCallback } from 'react';
import { AdminApiService } from '@infrastructure/http/AdminApiService';
import type { MatchResultsResponse } from '../../types/match';

interface UseVacancyMatchOptions {
  topN?: number;
  radiusKm?: number;
  excludeActive?: boolean;
}

export function useVacancyMatch(vacancyId: string | undefined) {
  const [results, setResults]     = useState<MatchResultsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  // Ao montar: dispara GET /match-results e POST /match simultaneamente.
  // GET traz os messagedAt históricos; POST roda o algoritmo fresco.
  // O resultado final usa os candidatos frescos com messagedAt preservado.
  useEffect(() => {
    if (!vacancyId) return;

    let cancelled = false;

    async function loadAndMatch() {
      try {
        setIsLoading(true);
        setError(null);

        const [saved, fresh] = await Promise.all([
          AdminApiService.getMatchResults(vacancyId!),
          AdminApiService.triggerMatch(vacancyId!),
        ]);

        if (!cancelled) {
          setResults({
            ...fresh,
            candidates: fresh.candidates.map(c => ({
              ...c,
              messagedAt: saved.candidates.find(p => p.workerId === c.workerId)?.messagedAt ?? null,
            })),
          });
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Falha ao carregar match');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadAndMatch();
    return () => { cancelled = true; };
  }, [vacancyId]);

  // Re-executa o match manualmente ("Rodar Novamente").
  // Dispara o match para salvar no banco e depois lê do banco —
  // getMatchResults é a fonte autoritativa: tem messaged_at real,
  // distance_km via PostGIS e active_cases_count correto.
  const runMatch = useCallback(async (options?: UseVacancyMatchOptions) => {
    if (!vacancyId) return;

    try {
      setIsRunning(true);
      setError(null);
      await AdminApiService.triggerMatch(vacancyId, options);
      const saved = await AdminApiService.getMatchResults(vacancyId);
      setResults(saved);
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
