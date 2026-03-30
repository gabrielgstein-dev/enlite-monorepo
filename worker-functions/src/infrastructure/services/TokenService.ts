import { Pool } from 'pg';
import { randomBytes } from 'crypto';
import { KMSEncryptionService } from '../security/KMSEncryptionService';

/**
 * TokenService — gera e resolve tokens para variáveis PII em mensagens.
 *
 * Tokens são IDs curtos armazenados em messaging_variable_tokens com TTL de 24h.
 * O OutboxProcessor resolve tokens antes de enviar via Twilio, substituindo
 * o token pelo valor real descriptografado via KMS.
 *
 * Fluxo:
 *   1. Ao criar mensagem no outbox: generate() troca PII por tokens no JSONB
 *   2. Ao processar outbox: resolve() troca tokens de volta pelo valor real (via KMS)
 *   3. cleanup_expired_tokens() remove tokens expirados (chamado via cron)
 */
export class TokenService {
  private kms: KMSEncryptionService;

  constructor(private readonly db: Pool) {
    this.kms = new KMSEncryptionService();
  }

  /** Mapeamento field_name → coluna encriptada no banco */
  private static readonly FIELD_TO_COLUMN: Record<string, string> = {
    worker_phone: 'phone',
    worker_name: 'first_name_encrypted',
    worker_first_name: 'first_name_encrypted',
    worker_last_name: 'last_name_encrypted',
    worker_email: 'email',
  };

  /**
   * Gera um token para um campo PII de um worker.
   * Retorna o token gerado (prefixo 'tk_' + 16 chars hex).
   */
  async generate(workerId: string, fieldName: string): Promise<string> {
    const token = `tk_${randomBytes(8).toString('hex')}`;

    await this.db.query(
      `INSERT INTO messaging_variable_tokens (token, field_name, worker_id)
       VALUES ($1, $2, $3)`,
      [token, fieldName, workerId],
    );

    return token;
  }

  /**
   * Resolve um token para seu valor plaintext buscando no worker via KMS.
   * Retorna null se o token não existir ou estiver expirado.
   */
  async resolve(token: string): Promise<string | null> {
    const result = await this.db.query<{ field_name: string; worker_id: string }>(
      `SELECT field_name, worker_id FROM messaging_variable_tokens
       WHERE token = $1 AND expires_at > NOW()`,
      [token],
    );

    if (result.rows.length === 0) return null;

    const { field_name, worker_id } = result.rows[0];
    return this.resolveFieldValue(worker_id, field_name);
  }

  /**
   * Resolve todas as variáveis de um JSONB de outbox.
   * Valores que começam com 'tk_' são tratados como tokens e resolvidos.
   * Valores que não são tokens são retornados como estão.
   */
  async resolveVariables(variables: Record<string, string>): Promise<Record<string, string>> {
    const resolved: Record<string, string> = {};

    for (const [key, value] of Object.entries(variables)) {
      if (value && value.startsWith('tk_')) {
        const plainValue = await this.resolve(value);
        resolved[key] = plainValue ?? value; // fallback ao token se expirado
      } else {
        resolved[key] = value;
      }
    }

    return resolved;
  }

  /**
   * Tokeniza variáveis PII de um worker para gravação no outbox.
   * Campos com nomes contendo 'phone', 'name', 'email' são tratados como PII.
   */
  async tokenizeVariables(
    workerId: string,
    variables: Record<string, string>,
  ): Promise<Record<string, string>> {
    const PII_PATTERNS = ['phone', 'name', 'email', 'document', 'address'];
    const tokenized: Record<string, string> = {};

    for (const [key, value] of Object.entries(variables)) {
      const isPii = PII_PATTERNS.some(p => key.toLowerCase().includes(p));
      if (isPii && value) {
        tokenized[key] = await this.generate(workerId, key);
      } else {
        tokenized[key] = value;
      }
    }

    return tokenized;
  }

  /**
   * Busca e descriptografa o valor do campo PII do worker.
   */
  private async resolveFieldValue(workerId: string, fieldName: string): Promise<string | null> {
    const column = TokenService.FIELD_TO_COLUMN[fieldName];

    // Campos encriptados: descriptografar via KMS
    if (column?.endsWith('_encrypted')) {
      const result = await this.db.query<Record<string, string>>(
        `SELECT ${column} FROM workers WHERE id = $1`,
        [workerId],
      );
      const encryptedValue = result.rows[0]?.[column];
      if (!encryptedValue) return null;
      return this.kms.decrypt(encryptedValue);
    }

    // Campos plaintext (phone, email — mantidos para deduplicação)
    if (column) {
      const result = await this.db.query<Record<string, string>>(
        `SELECT ${column} FROM workers WHERE id = $1`,
        [workerId],
      );
      return result.rows[0]?.[column] ?? null;
    }

    return null;
  }
}
