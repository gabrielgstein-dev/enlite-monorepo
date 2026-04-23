import { createHash } from 'crypto';
import { GoogleAuth } from 'google-auth-library';

// =====================
// GoogleApiKeyValidator — valida GCP API Keys via Google API (lookupKey)
//
// Fluxo:
//   1. Recebe a API Key raw do header X-Partner-Key
//   2. Chama GET apikeys.googleapis.com/v2/keys:lookupKey?keyString=<key>
//      → retorna apenas { name: "projects/.../keys/xxx" }
//   3. Chama GET apikeys.googleapis.com/v2/{name}
//      → retorna os detalhes incluindo displayName
//   4. Cache em memória (TTL 5 min) para evitar latência
//
// Em modo teste (USE_MOCK_AUTH=true), retorna displayName mock.
// =====================

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos
const LOOKUP_URL = 'https://apikeys.googleapis.com/v2/keys:lookupKey';
const KEYS_BASE_URL = 'https://apikeys.googleapis.com/v2';

interface CacheEntry {
  displayName: string;
  cachedAt: number;
}

export class GoogleApiKeyValidator {
  private cache = new Map<string, CacheEntry>();
  private auth: GoogleAuth;

  constructor() {
    this.auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
  }

  /**
   * Valida uma GCP API Key e retorna o displayName.
   * Retorna null se a key for inválida ou revogada.
   */
  async validate(apiKey: string): Promise<string | null> {
    // Bypass para testes E2E
    if (process.env.USE_MOCK_AUTH === 'true') {
      return 'mock-partner-key';
    }

    // Cache lookup (usa hash da key como chave — não guarda key raw em memória)
    const cacheKey = this.hashKey(apiKey);
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      return cached.displayName;
    }

    try {
      const client = await this.auth.getClient();

      // Passo 1: lookupKey → obtém o resource name da key
      const lookupResponse = await client.request<{ name: string }>({
        url: `${LOOKUP_URL}?keyString=${encodeURIComponent(apiKey)}`,
        method: 'GET',
      });

      const keyName = lookupResponse.data?.name;
      if (!keyName) {
        console.warn('[GoogleApiKeyValidator] lookupKey não retornou name');
        return null;
      }

      // Passo 2: busca detalhes da key pelo resource name → obtém displayName
      const detailResponse = await client.request<{ name: string; displayName: string }>({
        url: `${KEYS_BASE_URL}/${keyName}`,
        method: 'GET',
      });

      const displayName = detailResponse.data?.displayName;
      if (!displayName) {
        console.warn('[GoogleApiKeyValidator] Key sem displayName configurado');
        return null;
      }

      // Cachear resultado
      this.cache.set(cacheKey, { displayName, cachedAt: Date.now() });

      return displayName;
    } catch (err: any) {
      // 400/403/404 = key inválida ou sem permissão
      const status = err?.response?.status;
      if (status === 400 || status === 403 || status === 404) {
        console.warn(`[GoogleApiKeyValidator] Key rejeitada (HTTP ${status})`);
      } else {
        console.error('[GoogleApiKeyValidator] Erro ao validar key:', err?.message || err);
      }
      return null;
    }
  }

  /**
   * Limpa o cache (útil para testes)
   */
  clearCache(): void {
    this.cache.clear();
  }

  private hashKey(apiKey: string): string {
    return createHash('sha256').update(apiKey).digest('hex');
  }
}
