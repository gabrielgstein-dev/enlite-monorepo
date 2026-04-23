/**
 * WorkerDeduplicationService
 *
 * Detecta e mescla workers duplicados usando:
 *   1. SQL fuzzy matching (CUIT, levenshtein em telefone, trigram em nome)
 *   2. LLM (Groq/Llama) para confirmar duplicata e decidir qual dado é mais completo
 *   3. Merge atômico em transação PostgreSQL
 *
 * REGRA DE COMPLEMENTAÇÃO:
 *   Ex: Ana Care tem telefone "1151265663" (10 dígitos, faltando prefixo)
 *       Talentum tem telefone "5491151265663" (13 dígitos, correto)
 *   → LLM reconhece que é o mesmo número e elege o de 13 dígitos como canônico.
 */

import { Pool, PoolClient } from 'pg';
import { DatabaseConnection } from '@shared/database/DatabaseConnection';
import { AnalyticsRepository, DuplicateCandidate } from '../repositories/AnalyticsRepository';
import { KMSEncryptionService } from '@shared/security/KMSEncryptionService';

// ─── Tipos ────────────────────────────────────────────────────────────────

export interface DuplicateAnalysis {
  isSamePerson: boolean;
  confidence: number;       // 0.0 – 1.0
  explanation: string;
  preferredPhone: 1 | 2 | null;     // qual dos dois telefones é mais completo
  preferredEmail: 1 | 2 | null;
  preferredFirstName: 1 | 2 | null;
  preferredLastName: 1 | 2 | null;
  preferredCuit: 1 | 2 | null;
  mergedPhone: string | null;
  mergedEmail: string;
  mergedFirstName: string | null;
  mergedLastName: string | null;
  mergedCuit: string | null;
}

export interface DeduplicationResult {
  worker1Id: string;
  worker2Id: string;
  matchReason: string;
  analysis: DuplicateAnalysis;
  merged: boolean;
  canonicalId: string | null;
  error: string | null;
}

export interface DeduplicationReport {
  candidatesFound: number;
  analyzed: number;
  mergesExecuted: number;
  mergesSkipped: number;
  errors: number;
  details: DeduplicationResult[];
}

interface LLMDedupResponse {
  is_same_person: boolean;
  confidence: number;
  explanation: string;
  preferred_phone: 1 | 2 | null;
  preferred_email: 1 | 2 | null;
  preferred_first_name: 1 | 2 | null;
  preferred_last_name: 1 | 2 | null;
  preferred_cuit: 1 | 2 | null;
  merged_phone: string | null;
  merged_email: string;
  merged_first_name: string | null;
  merged_last_name: string | null;
  merged_cuit: string | null;
}

// ─── Service ──────────────────────────────────────────────────────────────

export class WorkerDeduplicationService {
  private pool: Pool;
  private analyticsRepo: AnalyticsRepository;
  private encryptionService: KMSEncryptionService;
  private apiKey: string;
  private model: string;

  constructor() {
    this.pool = DatabaseConnection.getInstance().getPool();
    this.analyticsRepo = new AnalyticsRepository();
    this.encryptionService = new KMSEncryptionService();
    this.apiKey  = process.env.GROQ_API_KEY ?? '';
    this.model   = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile';
  }

  // ── Pipeline principal ────────────────────────────────────────────────────

  /**
   * Executa o pipeline completo de deduplicação.
   * @param options.dryRun    Se true, apenas analisa sem mesclar (padrão: false)
   * @param options.confidence Limiar mínimo para executar merge automático (padrão: 0.85)
   * @param options.limit     Máximo de candidatos a analisar (padrão: 20)
   */
  async runDeduplication(options: {
    dryRun?: boolean;
    confidence?: number;
    limit?: number;
  } = {}): Promise<DeduplicationReport> {
    const { dryRun = false, confidence = 0.85, limit = 20 } = options;

    if (!this.apiKey) {
      throw new Error('GROQ_API_KEY não configurado. Obter em https://console.groq.com');
    }

    const candidates = await this.analyticsRepo.findDuplicateCandidates(limit);
    console.log(`[Dedup] ${candidates.length} candidatos encontrados para análise`);

    const report: DeduplicationReport = {
      candidatesFound: candidates.length,
      analyzed: 0,
      mergesExecuted: 0,
      mergesSkipped: 0,
      errors: 0,
      details: [],
    };

    for (const pair of candidates) {
      const result: DeduplicationResult = {
        worker1Id:   pair.worker1Id,
        worker2Id:   pair.worker2Id,
        matchReason: pair.matchReason,
        analysis:    null as unknown as DuplicateAnalysis,
        merged:      false,
        canonicalId: null,
        error:       null,
      };

      try {
        console.log(`[Dedup] Analisando par: ${pair.worker1Id} × ${pair.worker2Id} (${pair.matchReason})`);
        const analysis = await this.analyzeWithLLM(pair);
        result.analysis = analysis;
        report.analyzed++;

        if (analysis.isSamePerson && analysis.confidence >= confidence) {
          if (!dryRun) {
            // Escolhe o canônico: prefere o que tem first_name preenchido, depois o mais antigo
            const canonicalId = await this.chooseCanonical(pair.worker1Id, pair.worker2Id);
            const duplicateId = canonicalId === pair.worker1Id ? pair.worker2Id : pair.worker1Id;

            await this.mergeWorkers(canonicalId, duplicateId, {
              phone:     analysis.mergedPhone,
              email:     analysis.mergedEmail,
              firstName: analysis.mergedFirstName,
              lastName:  analysis.mergedLastName,
              cuit:      analysis.mergedCuit,
            });

            result.merged      = true;
            result.canonicalId = canonicalId;
            report.mergesExecuted++;
            console.log(`[Dedup] MERGE: canonical=${canonicalId}, duplicate=${duplicateId} (confidence=${analysis.confidence})`);
          } else {
            result.canonicalId = pair.worker1Id; // dry-run: indica o primeiro como provável canônico
            report.mergesSkipped++;
            console.log(`[Dedup] DRY-RUN: mergearia ${pair.worker1Id} ← ${pair.worker2Id} (confidence=${analysis.confidence})`);
          }
        } else {
          report.mergesSkipped++;
          console.log(`[Dedup] SKIP: isSame=${analysis.isSamePerson}, confidence=${analysis.confidence}`);
        }

        await sleep(150); // rate limit Groq free: 30 req/min
      } catch (err) {
        result.error = (err as Error).message;
        report.errors++;
        console.error(`[Dedup] Erro no par ${pair.worker1Id} × ${pair.worker2Id}:`, (err as Error).message);
      }

      report.details.push(result);
    }

    console.log(`[Dedup] Concluído | analisados: ${report.analyzed} | merges: ${report.mergesExecuted} | erros: ${report.errors}`);
    return report;
  }

  // ── Pipeline escopo: workers recém-importados ─────────────────────────────

  /**
   * Igual a runDeduplication, mas restringe a busca de candidatos
   * aos workers cujos IDs foram passados (recém-criados/atualizados no import).
   *
   * @param workerIds  IDs dos workers tocados na importação em curso
   * @param options    dryRun (default false), confidence (default 0.85)
   */
  async runDeduplicationForWorkers(
    workerIds: string[],
    options: { dryRun?: boolean; confidence?: number } = {},
  ): Promise<DeduplicationReport> {
    const empty: DeduplicationReport = {
      candidatesFound: 0, analyzed: 0, mergesExecuted: 0,
      mergesSkipped: 0, errors: 0, details: [],
    };
    if (workerIds.length === 0) return empty;

    if (!this.apiKey) {
      throw new Error('GROQ_API_KEY não configurado. Obter em https://console.groq.com');
    }

    const { dryRun = false, confidence = 0.85 } = options;
    const unique = [...new Set(workerIds)];
    const candidates = await this.analyticsRepo.findDuplicateCandidatesForWorkers(unique);
    console.log(`[Dedup] ${candidates.length} candidatos para ${unique.length} workers importados`);

    const report: DeduplicationReport = { ...empty, candidatesFound: candidates.length };

    for (const pair of candidates) {
      const result: DeduplicationResult = {
        worker1Id:   pair.worker1Id,
        worker2Id:   pair.worker2Id,
        matchReason: pair.matchReason,
        analysis:    null as unknown as DuplicateAnalysis,
        merged:      false,
        canonicalId: null,
        error:       null,
      };

      try {
        console.log(`[Dedup] Analisando par: ${pair.worker1Id} × ${pair.worker2Id} (${pair.matchReason})`);
        const analysis = await this.analyzeWithLLM(pair);
        result.analysis = analysis;
        report.analyzed++;

        if (analysis.isSamePerson && analysis.confidence >= confidence) {
          if (!dryRun) {
            const canonicalId = await this.chooseCanonical(pair.worker1Id, pair.worker2Id);
            const duplicateId = canonicalId === pair.worker1Id ? pair.worker2Id : pair.worker1Id;
            await this.mergeWorkers(canonicalId, duplicateId, {
              phone:     analysis.mergedPhone,
              email:     analysis.mergedEmail,
              firstName: analysis.mergedFirstName,
              lastName:  analysis.mergedLastName,
              cuit:      analysis.mergedCuit,
            });
            result.merged      = true;
            result.canonicalId = canonicalId;
            report.mergesExecuted++;
            console.log(`[Dedup] MERGE: canonical=${canonicalId}, duplicate=${duplicateId} (confidence=${analysis.confidence})`);
          } else {
            result.canonicalId = pair.worker1Id;
            report.mergesSkipped++;
          }
        } else {
          report.mergesSkipped++;
        }

        await sleep(150); // rate limit Groq free: 30 req/min
      } catch (err) {
        result.error = (err as Error).message;
        report.errors++;
        console.error(`[Dedup] Erro no par ${pair.worker1Id} × ${pair.worker2Id}:`, (err as Error).message);
      }

      report.details.push(result);
    }

    console.log(`[Dedup] Concluído | analisados: ${report.analyzed} | merges: ${report.mergesExecuted} | erros: ${report.errors}`);
    return report;
  }

  // ── Análise LLM ───────────────────────────────────────────────────────────

  async analyzeWithLLM(pair: DuplicateCandidate): Promise<DuplicateAnalysis> {
    const systemPrompt = `Eres un asistente experto en gestión de datos de trabajadores de salud en Argentina.
Tu tarea es analizar dos perfiles de worker y determinar si son la misma persona, considerando que los datos pueden provenir de diferentes fuentes (Ana Care, Talentum, Planilla Operativa, Talent Search CSV) y pueden tener errores tipográficos, truncaciones o formatos distintos.
Responde ÚNICAMENTE con JSON válido, sin texto adicional, sin markdown.`;

    const userPrompt = `Analiza si estos dos perfiles corresponden a la misma persona:

WORKER 1 (fuentes: ${pair.worker1Sources.join(', ') || 'desconocida'}):
- Nombre: ${pair.worker1FirstName ?? '?'} ${pair.worker1LastName ?? '?'}
- Teléfono: ${pair.worker1Phone ?? 'sin teléfono'}
- Email: ${pair.worker1Email}
- CUIT/CUIL: ${pair.worker1Cuit ?? 'no registrado'}

WORKER 2 (fuentes: ${pair.worker2Sources.join(', ') || 'desconocida'}):
- Nombre: ${pair.worker2FirstName ?? '?'} ${pair.worker2LastName ?? '?'}
- Teléfono: ${pair.worker2Phone ?? 'sin teléfono'}
- Email: ${pair.worker2Email}
- CUIT/CUIL: ${pair.worker2Cuit ?? 'no registrado'}

Motivo de detección: ${pair.matchReason}

REGLAS DE COMPLEMENTACIÓN:
- Teléfonos argentinos: 10 dígitos (ej: 1151265663) equivalen a 13 dígitos con prefixo (ej: 5491151265663). Son el mismo número si coinciden los últimos dígitos.
- Diferencia de 1-2 caracteres en teléfono puede ser truncación o typo (ej: 549115126566**3** vs 549115126566**0**).
- El CUIT/CUIL es el identificador más confiable de identidad.
- Emails con dominio idéntico y nombres similares sugieren duplicata.
- Para datos complementarios: elige el más completo y mejor formateado.

Responde exactamente con este JSON:
{
  "is_same_person": true/false,
  "confidence": 0.0-1.0,
  "explanation": "motivo en 1-2 oraciones",
  "preferred_phone": 1 o 2 o null,
  "preferred_email": 1 o 2 o null,
  "preferred_first_name": 1 o 2 o null,
  "preferred_last_name": 1 o 2 o null,
  "preferred_cuit": 1 o 2 o null,
  "merged_phone": "teléfono canónico (13 dígitos con 549 si AR) o null",
  "merged_email": "email canónico",
  "merged_first_name": "nombre canónico o null",
  "merged_last_name": "apellido canónico o null",
  "merged_cuit": "CUIT canônico (11 dígitos) o null"
}`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 400,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      throw new Error(`Groq API error ${response.status}: ${await response.text()}`);
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    const content = data.choices[0]?.message?.content;
    if (!content) throw new Error('Resposta vazia da Groq API');

    return this.parseLLMResponse(JSON.parse(content) as Partial<LLMDedupResponse>);
  }

  // ── Merge atômico ─────────────────────────────────────────────────────────

  /**
   * Mescla dois workers em transação atômica:
   *   1. Atualiza o canônico com os dados mesclados (COALESCE — não sobrescreve nulos)
   *   2. Re-linka encuadres, applications e blacklist para o canônico
   *   3. Marca o duplicado com merged_into_id = canonicalId
   */
  async mergeWorkers(
    canonicalId: string,
    duplicateId: string,
    resolvedData: {
      phone: string | null;
      email: string;
      firstName: string | null;
      lastName: string | null;
      cuit: string | null;
    },
  ): Promise<void> {
    // Criptografar nomes antes do merge — first_name/last_name não existem mais em plaintext
    const encryptedFirstName = resolvedData.firstName
      ? await this.encryptionService.encrypt(resolvedData.firstName)
      : null;
    const encryptedLastName = resolvedData.lastName
      ? await this.encryptionService.encrypt(resolvedData.lastName)
      : null;

    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Atualiza canônico com dados mesclados (COALESCE preserva o que já existe)
      await client.query(
        `UPDATE workers SET
           phone                = COALESCE($2, phone),
           email                = COALESCE($3, email),
           first_name_encrypted = COALESCE($4, first_name_encrypted),
           last_name_encrypted  = COALESCE($5, last_name_encrypted),
           cuit                 = COALESCE($6, cuit),
           data_sources = ARRAY(
             SELECT DISTINCT unnest(
               array_cat(
                 COALESCE(data_sources, '{}'),
                 (SELECT COALESCE(data_sources, '{}') FROM workers WHERE id = $7)
               )
             )
           ),
           updated_at = NOW()
         WHERE id = $1`,
        [canonicalId, resolvedData.phone, resolvedData.email,
         encryptedFirstName, encryptedLastName, resolvedData.cuit,
         duplicateId],
      );

      // 2a. Re-linka encuadres
      await client.query(
        'UPDATE encuadres SET worker_id = $1 WHERE worker_id = $2',
        [canonicalId, duplicateId],
      );

      // 2b. Re-linka worker_job_applications (ignora conflitos de unique)
      // application_funnel_stage é copiado da linha original — após migration 096 o DEFAULT 'APPLIED'
      // foi removido do domínio válido, portanto é obrigatório selecionar o valor da linha fonte.
      await client.query(
        `INSERT INTO worker_job_applications (worker_id, job_posting_id, application_status, application_funnel_stage, source)
         SELECT $1, job_posting_id, application_status, application_funnel_stage, source
         FROM worker_job_applications WHERE worker_id = $2
         ON CONFLICT (worker_id, job_posting_id) DO NOTHING`,
        [canonicalId, duplicateId],
      );
      await client.query(
        'DELETE FROM worker_job_applications WHERE worker_id = $1',
        [duplicateId],
      );

      // 2c. Re-linka blacklist (ignora conflitos de unique worker_id+reason)
      // Dual-write: copia tanto plaintext quanto encrypted (migration 089)
      await client.query(
        `INSERT INTO blacklist (worker_id, worker_raw_name, worker_raw_phone, reason, reason_encrypted, detail, detail_encrypted, registered_by, can_take_eventual)
         SELECT $1, worker_raw_name, worker_raw_phone, reason, reason_encrypted, detail, detail_encrypted, registered_by, can_take_eventual
         FROM blacklist WHERE worker_id = $2
         ON CONFLICT (worker_id, reason) WHERE worker_id IS NOT NULL DO NOTHING`,
        [canonicalId, duplicateId],
      );
      await client.query(
        'DELETE FROM blacklist WHERE worker_id = $1',
        [duplicateId],
      );

      // 3. Marca duplicado como mesclado
      await client.query(
        `UPDATE workers SET merged_into_id = $1, updated_at = NOW() WHERE id = $2`,
        [canonicalId, duplicateId],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Escolhe o worker canônico: prefere o com mais dados preenchidos (first_name), depois o mais antigo. */
  private async chooseCanonical(id1: string, id2: string): Promise<string> {
    const result = await this.pool.query(
      `SELECT id, created_at
       FROM workers WHERE id IN ($1, $2)
       ORDER BY (first_name_encrypted IS NOT NULL) DESC, created_at ASC
       LIMIT 1`,
      [id1, id2],
    );
    return result.rows[0]?.id ?? id1;
  }

  private parseLLMResponse(raw: Partial<LLMDedupResponse>): DuplicateAnalysis {
    return {
      isSamePerson:     typeof raw.is_same_person === 'boolean' ? raw.is_same_person : false,
      confidence:       typeof raw.confidence === 'number' ? Math.max(0, Math.min(1, raw.confidence)) : 0,
      explanation:      typeof raw.explanation === 'string' ? raw.explanation : '',
      preferredPhone:   [1,2].includes(raw.preferred_phone as number) ? raw.preferred_phone as 1|2 : null,
      preferredEmail:   [1,2].includes(raw.preferred_email as number) ? raw.preferred_email as 1|2 : null,
      preferredFirstName: [1,2].includes(raw.preferred_first_name as number) ? raw.preferred_first_name as 1|2 : null,
      preferredLastName:  [1,2].includes(raw.preferred_last_name as number) ? raw.preferred_last_name as 1|2 : null,
      preferredCuit:    [1,2].includes(raw.preferred_cuit as number) ? raw.preferred_cuit as 1|2 : null,
      mergedPhone:      typeof raw.merged_phone === 'string' ? raw.merged_phone : null,
      mergedEmail:      typeof raw.merged_email === 'string' ? raw.merged_email : '',
      mergedFirstName:  typeof raw.merged_first_name === 'string' ? raw.merged_first_name : null,
      mergedLastName:   typeof raw.merged_last_name === 'string' ? raw.merged_last_name : null,
      mergedCuit:       typeof raw.merged_cuit === 'string' ? raw.merged_cuit : null,
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
