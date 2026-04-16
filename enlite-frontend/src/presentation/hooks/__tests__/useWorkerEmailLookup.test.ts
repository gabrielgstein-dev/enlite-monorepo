/**
 * useWorkerEmailLookup.test.ts
 *
 * Testes unitários do hook useWorkerEmailLookup.
 *
 * Cenários cobertos:
 *   1. Email válido encontrado com phoneMasked → found=true, phoneMasked presente
 *   2. Email válido encontrado sem phone → found=true, phoneMasked undefined
 *   3. Email não encontrado → found=false
 *   4. Email inválido (sem @) → não dispara chamada HTTP
 *   5. Email vazio → não dispara chamada HTTP
 *   6. Erro de rede → found=false (fallback silencioso)
 *   7. Mesmo email não dispara 2x (dedup)
 *   8. reset() limpa o estado
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWorkerEmailLookup } from '../useWorkerEmailLookup';

// ── Mock do WorkerApiService ──────────────────────────────────────────────────

vi.mock('@infrastructure/http/WorkerApiService', () => ({
  WorkerApiService: {
    lookupByEmail: vi.fn(),
  },
}));

import { WorkerApiService } from '@infrastructure/http/WorkerApiService';

const mockLookupByEmail = vi.mocked(WorkerApiService.lookupByEmail);

// ── Helpers ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useWorkerEmailLookup', () => {
  // ── Estado inicial ─────────────────────────────────────────────────────────

  it('estado inicial: isLoading=false, found=null, phoneMasked=undefined', () => {
    const { result } = renderHook(() => useWorkerEmailLookup());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.found).toBeNull();
    expect(result.current.phoneMasked).toBeUndefined();
  });

  // ── Cenário 1: email válido encontrado com phone ───────────────────────────

  it('email válido encontrado com phoneMasked → found=true e phoneMasked preenchido', async () => {
    mockLookupByEmail.mockResolvedValueOnce({
      found: true,
      phoneMasked: 'xxxxxxxxxx978',
    });

    const { result } = renderHook(() => useWorkerEmailLookup());

    await act(async () => {
      await result.current.lookup('worker@example.com');
    });

    expect(mockLookupByEmail).toHaveBeenCalledOnce();
    expect(mockLookupByEmail).toHaveBeenCalledWith('worker@example.com');
    expect(result.current.found).toBe(true);
    expect(result.current.phoneMasked).toBe('xxxxxxxxxx978');
    expect(result.current.isLoading).toBe(false);
  });

  // ── Cenário 2: email válido encontrado sem phone ───────────────────────────

  it('email válido encontrado sem phoneMasked → found=true e phoneMasked=undefined', async () => {
    mockLookupByEmail.mockResolvedValueOnce({
      found: true,
      phoneMasked: undefined,
    });

    const { result } = renderHook(() => useWorkerEmailLookup());

    await act(async () => {
      await result.current.lookup('worker-no-phone@example.com');
    });

    expect(mockLookupByEmail).toHaveBeenCalledOnce();
    expect(result.current.found).toBe(true);
    expect(result.current.phoneMasked).toBeUndefined();
  });

  // ── Cenário 3: email não encontrado ───────────────────────────────────────

  it('email não encontrado → found=false', async () => {
    mockLookupByEmail.mockResolvedValueOnce({ found: false });

    const { result } = renderHook(() => useWorkerEmailLookup());

    await act(async () => {
      await result.current.lookup('new.worker@example.com');
    });

    expect(mockLookupByEmail).toHaveBeenCalledOnce();
    expect(result.current.found).toBe(false);
    expect(result.current.phoneMasked).toBeUndefined();
  });

  // ── Cenário 4: email inválido (sem @) ─────────────────────────────────────

  it('email inválido (sem @) → não dispara chamada HTTP', async () => {
    const { result } = renderHook(() => useWorkerEmailLookup());

    await act(async () => {
      await result.current.lookup('emailsem-arroba');
    });

    expect(mockLookupByEmail).not.toHaveBeenCalled();
    expect(result.current.found).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  // ── Cenário 5: email vazio ─────────────────────────────────────────────────

  it('email vazio → não dispara chamada HTTP', async () => {
    const { result } = renderHook(() => useWorkerEmailLookup());

    await act(async () => {
      await result.current.lookup('');
    });

    expect(mockLookupByEmail).not.toHaveBeenCalled();
    expect(result.current.found).toBeNull();
  });

  // ── Cenário 5b: email com apenas espaços ──────────────────────────────────

  it('email com apenas espaços → não dispara chamada HTTP', async () => {
    const { result } = renderHook(() => useWorkerEmailLookup());

    await act(async () => {
      await result.current.lookup('   ');
    });

    expect(mockLookupByEmail).not.toHaveBeenCalled();
    expect(result.current.found).toBeNull();
  });

  // ── Cenário 6: erro de rede → fallback silencioso ─────────────────────────

  it('erro de rede → found=false (fallback silencioso, sem throw)', async () => {
    mockLookupByEmail.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useWorkerEmailLookup());

    // Não deve lançar exceção — o hook captura o erro internamente e define found=false
    await act(async () => {
      await result.current.lookup('worker@example.com');
    });

    expect(result.current.found).toBe(false);
    expect(result.current.phoneMasked).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });

  // ── Cenário 7: mesmo email não dispara 2x (dedup) ─────────────────────────

  it('mesmo email chamado 2x → API chamada apenas 1x (dedup)', async () => {
    mockLookupByEmail.mockResolvedValue({ found: true, phoneMasked: 'xxxxxxxxxx978' });

    const { result } = renderHook(() => useWorkerEmailLookup());

    await act(async () => {
      await result.current.lookup('dedup@example.com');
    });

    await act(async () => {
      await result.current.lookup('dedup@example.com');
    });

    // A API só deve ter sido chamada uma vez, mesmo com o email repetido
    expect(mockLookupByEmail).toHaveBeenCalledOnce();
    expect(result.current.found).toBe(true);
  });

  it('mesmo email com capitalização diferente é deduplicado (case-insensitive)', async () => {
    mockLookupByEmail.mockResolvedValue({ found: true, phoneMasked: 'xxxxxxxxxx978' });

    const { result } = renderHook(() => useWorkerEmailLookup());

    await act(async () => {
      await result.current.lookup('Dedup@Example.COM');
    });

    await act(async () => {
      await result.current.lookup('dedup@example.com');
    });

    // Após normalização lowercase, é o mesmo email → API só chamada 1x
    expect(mockLookupByEmail).toHaveBeenCalledOnce();
  });

  it('emails diferentes disparam chamadas separadas', async () => {
    mockLookupByEmail
      .mockResolvedValueOnce({ found: true, phoneMasked: 'xxxxxxxxxx978' })
      .mockResolvedValueOnce({ found: false });

    const { result } = renderHook(() => useWorkerEmailLookup());

    await act(async () => {
      await result.current.lookup('first@example.com');
    });

    await act(async () => {
      await result.current.lookup('second@example.com');
    });

    expect(mockLookupByEmail).toHaveBeenCalledTimes(2);
    expect(mockLookupByEmail).toHaveBeenNthCalledWith(1, 'first@example.com');
    expect(mockLookupByEmail).toHaveBeenNthCalledWith(2, 'second@example.com');
    // O estado final reflete o último lookup
    expect(result.current.found).toBe(false);
  });

  // ── Cenário 8: reset() limpa o estado ─────────────────────────────────────

  it('reset() limpa found, phoneMasked e permite re-lookup do mesmo email', async () => {
    mockLookupByEmail.mockResolvedValue({ found: true, phoneMasked: 'xxxxxxxxxx978' });

    const { result } = renderHook(() => useWorkerEmailLookup());

    await act(async () => {
      await result.current.lookup('reset-test@example.com');
    });

    expect(result.current.found).toBe(true);
    expect(result.current.phoneMasked).toBe('xxxxxxxxxx978');

    act(() => {
      result.current.reset();
    });

    expect(result.current.found).toBeNull();
    expect(result.current.phoneMasked).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });

  it('reset() permite re-lookup do mesmo email (dedup resetado)', async () => {
    mockLookupByEmail
      .mockResolvedValueOnce({ found: true, phoneMasked: 'xxxxxxxxxx978' })
      .mockResolvedValueOnce({ found: false });

    const { result } = renderHook(() => useWorkerEmailLookup());

    await act(async () => {
      await result.current.lookup('reset-dedup@example.com');
    });

    // Reset limpa o cache interno de dedup
    act(() => {
      result.current.reset();
    });

    // Agora o mesmo email deve disparar outra chamada
    await act(async () => {
      await result.current.lookup('reset-dedup@example.com');
    });

    expect(mockLookupByEmail).toHaveBeenCalledTimes(2);
    expect(result.current.found).toBe(false);
  });

  // ── Estado de loading ──────────────────────────────────────────────────────

  it('isLoading=true enquanto a requisição está em andamento', async () => {
    let resolvePromise!: (value: { found: boolean; phoneMasked?: string }) => void;
    const pendingPromise = new Promise<{ found: boolean; phoneMasked?: string }>(
      (resolve) => { resolvePromise = resolve; },
    );

    mockLookupByEmail.mockReturnValueOnce(pendingPromise);

    const { result } = renderHook(() => useWorkerEmailLookup());

    // Inicia o lookup sem await para capturar o estado intermediário
    act(() => {
      void result.current.lookup('loading@example.com');
    });

    expect(result.current.isLoading).toBe(true);

    // Resolve a promessa
    await act(async () => {
      resolvePromise({ found: true, phoneMasked: 'xxxxxxxxxx978' });
      await pendingPromise;
    });

    expect(result.current.isLoading).toBe(false);
  });

  // ── Normalização do email ──────────────────────────────────────────────────

  it('email com espaços extras é normalizado antes de enviar à API', async () => {
    mockLookupByEmail.mockResolvedValueOnce({ found: false });

    const { result } = renderHook(() => useWorkerEmailLookup());

    await act(async () => {
      await result.current.lookup('  worker@example.com  ');
    });

    // A API deve receber o email sem espaços e em lowercase
    expect(mockLookupByEmail).toHaveBeenCalledWith('worker@example.com');
  });
});
