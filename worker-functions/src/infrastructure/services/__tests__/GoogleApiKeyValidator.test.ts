/**
 * GoogleApiKeyValidator.test.ts
 *
 * Testa a validação de GCP API Keys via Google API (lookupKey).
 *
 * Cenários cobertos:
 *   - Bypass em modo mock (USE_MOCK_AUTH=true)
 *   - Cache hit/miss e expiração de TTL
 *   - Respostas bem-sucedidas da Google API
 *   - Respostas de erro (400, 403, 404, 500)
 *   - Key válida mas sem displayName
 *   - Erros de rede / timeout
 *   - Limpeza de cache
 *   - Não armazena key raw no cache
 */

// Mock google-auth-library antes de importar o módulo testado
const mockRequest = jest.fn();
const mockGetClient = jest.fn().mockResolvedValue({ request: mockRequest });

jest.mock('google-auth-library', () => ({
  GoogleAuth: jest.fn().mockImplementation(() => ({
    getClient: mockGetClient,
  })),
}));

import { GoogleApiKeyValidator } from '../GoogleApiKeyValidator';

describe('GoogleApiKeyValidator', () => {
  let validator: GoogleApiKeyValidator;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.USE_MOCK_AUTH;
    validator = new GoogleApiKeyValidator();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ─────────────────────────────────────────────────────────────────
  // Mock mode bypass (USE_MOCK_AUTH=true)
  // ─────────────────────────────────────────────────────────────────

  describe('mock mode (USE_MOCK_AUTH=true)', () => {
    beforeEach(() => {
      process.env.USE_MOCK_AUTH = 'true';
    });

    it('deve retornar displayName mock sem chamar Google API', async () => {
      const result = await validator.validate('any-key-value');

      expect(result).toBe('mock-partner-key');
      expect(mockGetClient).not.toHaveBeenCalled();
      expect(mockRequest).not.toHaveBeenCalled();
    });

    it('deve retornar mock mesmo com key vazia', async () => {
      const result = await validator.validate('');
      expect(result).toBe('mock-partner-key');
    });

    it('deve retornar mock mesmo com key undefined coerced', async () => {
      const result = await validator.validate(undefined as unknown as string);
      expect(result).toBe('mock-partner-key');
    });

    it('não deve popular o cache em modo mock', async () => {
      await validator.validate('test-key');
      // Desabilitar mock mode e testar que cache está vazio
      process.env.USE_MOCK_AUTH = 'false';
      mockRequest.mockRejectedValue({ response: { status: 404 } });

      const result = await validator.validate('test-key');
      expect(result).toBeNull(); // cache vazio, API rejeitou
      expect(mockRequest).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Validação bem-sucedida via Google API
  // ─────────────────────────────────────────────────────────────────

  describe('validação com Google API (sucesso)', () => {
    it('deve retornar displayName quando key é válida', async () => {
      mockRequest.mockResolvedValue({
        data: { name: 'projects/123/keys/abc', displayName: 'API-Key-Talentum' },
      });

      const result = await validator.validate('AIzaSyValid123');

      expect(result).toBe('API-Key-Talentum');
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('keyString=AIzaSyValid123'),
          method: 'GET',
        }),
      );
    });

    it('deve lidar com displayName contendo caracteres especiais', async () => {
      mockRequest.mockResolvedValue({
        data: { name: 'projects/123/keys/abc', displayName: 'API-Key-Ação & Saúde (teste)' },
      });

      const result = await validator.validate('AIzaSpecial');
      expect(result).toBe('API-Key-Ação & Saúde (teste)');
    });

    it('deve fazer URL encode da key na chamada API', async () => {
      mockRequest.mockResolvedValue({
        data: { name: 'projects/123/keys/abc', displayName: 'Test-Key' },
      });

      await validator.validate('key+with/special=chars');

      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('key%2Bwith%2Fspecial%3Dchars'),
        }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Validação com erros da Google API
  // ─────────────────────────────────────────────────────────────────

  describe('validação com Google API (erros)', () => {
    it('deve retornar null quando key é inválida (HTTP 400)', async () => {
      mockRequest.mockRejectedValue({ response: { status: 400 } });

      const result = await validator.validate('invalid-key');
      expect(result).toBeNull();
    });

    it('deve retornar null quando acesso negado (HTTP 403)', async () => {
      mockRequest.mockRejectedValue({ response: { status: 403 } });

      const result = await validator.validate('forbidden-key');
      expect(result).toBeNull();
    });

    it('deve retornar null quando key não encontrada (HTTP 404)', async () => {
      mockRequest.mockRejectedValue({ response: { status: 404 } });

      const result = await validator.validate('missing-key');
      expect(result).toBeNull();
    });

    it('deve retornar null em erro de servidor (HTTP 500)', async () => {
      mockRequest.mockRejectedValue({ response: { status: 500 } });

      const result = await validator.validate('error-key');
      expect(result).toBeNull();
    });

    it('deve retornar null em erro de rede (sem response)', async () => {
      mockRequest.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await validator.validate('timeout-key');
      expect(result).toBeNull();
    });

    it('deve retornar null quando response.data é undefined', async () => {
      mockRequest.mockResolvedValue({ data: undefined });

      const result = await validator.validate('no-data-key');
      expect(result).toBeNull();
    });

    it('deve retornar null quando response.data não tem displayName', async () => {
      mockRequest.mockResolvedValue({
        data: { name: 'projects/123/keys/abc' }, // sem displayName
      });

      const result = await validator.validate('no-display-name-key');
      expect(result).toBeNull();
    });

    it('deve retornar null quando displayName é string vazia', async () => {
      mockRequest.mockResolvedValue({
        data: { name: 'projects/123/keys/abc', displayName: '' },
      });

      const result = await validator.validate('empty-display-name-key');
      expect(result).toBeNull();
    });

    it('deve retornar null quando getClient falha', async () => {
      mockGetClient.mockRejectedValueOnce(new Error('ADC not configured'));

      const result = await validator.validate('no-adc-key');
      expect(result).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Cache
  // ─────────────────────────────────────────────────────────────────

  describe('cache', () => {
    // Helper para mockar as duas chamadas API (lookup + details)
    const mockLookupAndDetails = (displayName: string) => {
      mockRequest
        .mockResolvedValueOnce({ data: { name: 'projects/123/keys/abc' } }) // lookupKey
        .mockResolvedValueOnce({ data: { name: 'projects/123/keys/abc', displayName } }); // details
    };

    it('deve retornar do cache na segunda chamada com mesma key', async () => {
      mockLookupAndDetails('API-Key-Talentum');

      const result1 = await validator.validate('cached-key');
      const result2 = await validator.validate('cached-key');

      expect(result1).toBe('API-Key-Talentum');
      expect(result2).toBe('API-Key-Talentum');
      // API chamada apenas uma vez — segunda veio do cache
      expect(mockRequest).toHaveBeenCalledTimes(2); // 2 chamadas: lookup + details
    });

    it('deve diferenciar keys distintas no cache', async () => {
      mockRequest
        .mockResolvedValueOnce({ data: { name: 'p/k/1' } })
        .mockResolvedValueOnce({ data: { name: 'p/k/1', displayName: 'API-Key-Talentum' } })
        .mockResolvedValueOnce({ data: { name: 'p/k/2' } })
        .mockResolvedValueOnce({ data: { name: 'p/k/2', displayName: 'API-Key-AnaCare' } });

      const r1 = await validator.validate('key-talentum');
      const r2 = await validator.validate('key-anacare');

      expect(r1).toBe('API-Key-Talentum');
      expect(r2).toBe('API-Key-AnaCare');
      expect(mockRequest).toHaveBeenCalledTimes(4); // 2 keys × 2 chamadas cada
    });

    it('deve expirar cache após TTL (5 minutos)', async () => {
      mockLookupAndDetails('API-Key-Talentum');

      await validator.validate('ttl-key');
      expect(mockRequest).toHaveBeenCalledTimes(2); // lookup + details

      // Simular passagem do tempo: acessar o cache internamente
      // e modificar o cachedAt para 6 minutos atrás
      const cacheMap = (validator as any).cache as Map<string, { displayName: string; cachedAt: number }>;
      for (const [key, entry] of cacheMap) {
        entry.cachedAt = Date.now() - 6 * 60 * 1000; // 6 min atrás
      }

      // Mockar novamente para a segunda chamada após expiração
      mockLookupAndDetails('API-Key-Talentum');

      await validator.validate('ttl-key');
      // Deve ter chamado a API novamente porque cache expirou
      expect(mockRequest).toHaveBeenCalledTimes(4); // 2 originais + 2 após expiração
    });

    it('deve usar cache válido dentro do TTL', async () => {
      mockLookupAndDetails('API-Key-Talentum');

      await validator.validate('fresh-key');

      // Simular 4 minutos (dentro do TTL de 5 min)
      const cacheMap = (validator as any).cache as Map<string, { displayName: string; cachedAt: number }>;
      for (const [, entry] of cacheMap) {
        entry.cachedAt = Date.now() - 4 * 60 * 1000;
      }

      await validator.validate('fresh-key');
      expect(mockRequest).toHaveBeenCalledTimes(2); // Ainda do cache (2 chamadas originais)
    });

    it('não deve cachear respostas de erro', async () => {
      mockRequest
        .mockRejectedValueOnce({ response: { status: 400 } }) // lookup falha
        .mockResolvedValueOnce({ data: { name: 'p/k/1' } }) // lookup ok
        .mockResolvedValueOnce({ data: { name: 'p/k/1', displayName: 'API-Key-Recovered' } }); // details ok

      const r1 = await validator.validate('flaky-key');
      expect(r1).toBeNull();

      const r2 = await validator.validate('flaky-key');
      expect(r2).toBe('API-Key-Recovered');

      // Ambas chamaram a API (erro não foi cacheado)
      expect(mockRequest).toHaveBeenCalledTimes(3); // 1 erro + 2 sucesso
    });

    it('clearCache() deve limpar todo o cache', async () => {
      mockLookupAndDetails('API-Key-Talentum');

      await validator.validate('clear-test-key');
      expect(mockRequest).toHaveBeenCalledTimes(2);

      validator.clearCache();

      // Mockar novamente para a segunda chamada
      mockLookupAndDetails('API-Key-Talentum');

      await validator.validate('clear-test-key');
      // Deve chamar API novamente após limpar cache
      expect(mockRequest).toHaveBeenCalledTimes(4); // 2 originais + 2 após clear
    });

    it('não deve armazenar key raw no cache (usa hash)', async () => {
      mockLookupAndDetails('API-Key-Test');

      const rawKey = 'AIzaSySecretKey12345';
      await validator.validate(rawKey);

      const cacheMap = (validator as any).cache as Map<string, any>;
      const cacheKeys = Array.from(cacheMap.keys());

      // Nenhuma chave do cache deve ser a key raw
      expect(cacheKeys).not.toContain(rawKey);
      // Cache deve ter exatamente 1 entrada (o hash)
      expect(cacheKeys.length).toBe(1);
      // O hash deve ter 64 chars (SHA-256 hex)
      expect(cacheKeys[0].length).toBe(64);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Chamadas concorrentes
  // ─────────────────────────────────────────────────────────────────

  describe('chamadas concorrentes', () => {
    it('deve lidar com chamadas paralelas para a mesma key', async () => {
      let lookupCallCount = 0;
      mockRequest.mockImplementation(async (config: any) => {
        const url = config?.url || '';
        // Simular latência
        await new Promise(r => setTimeout(r, 10));

        if (url.includes('lookupKey')) {
          lookupCallCount++;
          return { data: { name: 'p/k/1' } };
        }
        // Chamada de details
        return { data: { name: 'p/k/1', displayName: 'API-Key-Concurrent' } };
      });

      const results = await Promise.all([
        validator.validate('concurrent-key'),
        validator.validate('concurrent-key'),
        validator.validate('concurrent-key'),
      ]);

      // Todas devem retornar o mesmo displayName
      expect(results).toEqual(['API-Key-Concurrent', 'API-Key-Concurrent', 'API-Key-Concurrent']);
    });
  });
});
