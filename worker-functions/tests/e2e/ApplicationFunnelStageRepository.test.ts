/**
 * ApplicationFunnelStageRepository.test.ts
 *
 * Testes unitários com banco real para validar a refatoração de
 * worker_job_applications.application_funnel_stage (Migration 096).
 *
 * Cada teste insere dados reais no banco de teste e valida o que foi persistido.
 *
 * Cenários cobertos:
 *   AF1  - INSERT com application_funnel_stage = 'INITIATED'
 *   AF2  - UPDATE para cada um dos 7 stages válidos
 *   AF3  - Constraint violation — stage antigo 'APPLIED' deve ser rejeitado
 *   AF4  - Constraint violation — stage antigo 'PRE_SCREENING' deve ser rejeitado
 *   AF5  - Constraint violation — stage antigo 'INTERVIEW_SCHEDULED' deve ser rejeitado
 *   AF6  - Constraint violation — stage antigo 'INTERVIEWED' deve ser rejeitado
 *   AF7  - Constraint violation — stage antigo 'HIRED' deve ser rejeitado
 *   AF8  - Constraint violation — stage antigo 'REJECTED' deve ser rejeitado
 *   AF9  - Listar applications por stage — filtrar 1 de 3 em stages distintos
 *   AF10 - DEFAULT do stage ao INSERT sem especificar (verifica valor inicial)
 */

import { Pool } from 'pg';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://enlite_admin:enlite_password@localhost:5432/enlite_e2e';

const pool = new Pool({ connectionString: TEST_DATABASE_URL });

const TEST_EMAIL_DOMAIN = '@appfunnelstagerepo.test';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function insertTestWorker(suffix: string): Promise<string> {
  const result = await pool.query(
    `INSERT INTO workers (auth_uid, email, country, timezone)
     VALUES ($1, $2, 'BR', 'America/Sao_Paulo')
     RETURNING id`,
    [`uid-${suffix}`, `worker-${suffix}${TEST_EMAIL_DOMAIN}`],
  );
  return result.rows[0].id as string;
}

async function insertTestJobPosting(suffix: string): Promise<string> {
  const result = await pool.query(
    `INSERT INTO job_postings (title, description, country, status)
     VALUES ($1, 'Test job description', 'BR', 'active')
     RETURNING id`,
    [`Test Job ${suffix}`],
  );
  return result.rows[0].id as string;
}

/** Insere application com stage explícito. Omitir stage usa o DEFAULT do banco. */
async function insertApplication(
  workerId: string,
  jobPostingId: string,
  stage?: string,
): Promise<string> {
  if (stage !== undefined) {
    const result = await pool.query(
      `INSERT INTO worker_job_applications (worker_id, job_posting_id, application_funnel_stage)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [workerId, jobPostingId, stage],
    );
    return result.rows[0].id as string;
  }

  const result = await pool.query(
    `INSERT INTO worker_job_applications (worker_id, job_posting_id)
     VALUES ($1, $2)
     RETURNING id`,
    [workerId, jobPostingId],
  );
  return result.rows[0].id as string;
}

async function getApplicationStage(applicationId: string): Promise<string> {
  const result = await pool.query(
    'SELECT application_funnel_stage FROM worker_job_applications WHERE id = $1',
    [applicationId],
  );
  return result.rows[0]?.application_funnel_stage as string;
}

function makeSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Limpa apenas os dados inseridos neste arquivo de teste
afterEach(async () => {
  await pool.query(
    `DELETE FROM workers WHERE email LIKE '%${TEST_EMAIL_DOMAIN}'`,
  );
});

afterAll(async () => {
  await pool.end();
});

// ── AF1: INSERT com INITIATED ─────────────────────────────────────────────────

describe('AF1 — INSERT com application_funnel_stage = INITIATED', () => {
  it('deve persistir stage = INITIATED corretamente', async () => {
    // Arrange
    const s = makeSuffix();
    const workerId = await insertTestWorker(s);
    const jobId = await insertTestJobPosting(s);

    // Act
    const appId = await insertApplication(workerId, jobId, 'INITIATED');

    // Assert
    const stage = await getApplicationStage(appId);
    expect(stage).toBe('INITIATED');
  });
});

// ── AF2: UPDATE para cada um dos 7 stages válidos ─────────────────────────────

describe('AF2 — UPDATE para cada um dos 7 stages válidos', () => {
  const VALID_STAGES = [
    'INITIATED',
    'IN_PROGRESS',
    'COMPLETED',
    'QUALIFIED',
    'IN_DOUBT',
    'NOT_QUALIFIED',
    'PLACED',
  ] as const;

  it.each(VALID_STAGES)(
    'deve aceitar UPDATE para stage = %s e persistir no banco',
    async (targetStage) => {
      // Arrange
      const s = makeSuffix();
      const workerId = await insertTestWorker(s);
      const jobId = await insertTestJobPosting(s);
      const appId = await insertApplication(workerId, jobId, 'INITIATED');

      // Act
      await pool.query(
        'UPDATE worker_job_applications SET application_funnel_stage = $1 WHERE id = $2',
        [targetStage, appId],
      );

      // Assert
      const stage = await getApplicationStage(appId);
      expect(stage).toBe(targetStage);
    },
  );
});

// ── AF3–AF8: Constraint — stages antigos devem ser rejeitados ─────────────────

describe('AF3 — Constraint violation: stage antigo APPLIED', () => {
  it('deve rejeitar INSERT com stage = "APPLIED"', async () => {
    // Arrange
    const s = makeSuffix();
    const workerId = await insertTestWorker(s);
    const jobId = await insertTestJobPosting(s);

    // Act / Assert
    await expect(insertApplication(workerId, jobId, 'APPLIED')).rejects.toThrow();
  });
});

describe('AF4 — Constraint violation: stage antigo PRE_SCREENING', () => {
  it('deve rejeitar INSERT com stage = "PRE_SCREENING"', async () => {
    // Arrange
    const s = makeSuffix();
    const workerId = await insertTestWorker(s);
    const jobId = await insertTestJobPosting(s);

    // Act / Assert
    await expect(insertApplication(workerId, jobId, 'PRE_SCREENING')).rejects.toThrow();
  });
});

describe('AF5 — Constraint violation: stage antigo INTERVIEW_SCHEDULED', () => {
  it('deve rejeitar INSERT com stage = "INTERVIEW_SCHEDULED"', async () => {
    // Arrange
    const s = makeSuffix();
    const workerId = await insertTestWorker(s);
    const jobId = await insertTestJobPosting(s);

    // Act / Assert
    await expect(insertApplication(workerId, jobId, 'INTERVIEW_SCHEDULED')).rejects.toThrow();
  });
});

describe('AF6 — Constraint violation: stage antigo INTERVIEWED', () => {
  it('deve rejeitar INSERT com stage = "INTERVIEWED"', async () => {
    // Arrange
    const s = makeSuffix();
    const workerId = await insertTestWorker(s);
    const jobId = await insertTestJobPosting(s);

    // Act / Assert
    await expect(insertApplication(workerId, jobId, 'INTERVIEWED')).rejects.toThrow();
  });
});

describe('AF7 — Constraint violation: stage antigo HIRED', () => {
  it('deve rejeitar INSERT com stage = "HIRED"', async () => {
    // Arrange
    const s = makeSuffix();
    const workerId = await insertTestWorker(s);
    const jobId = await insertTestJobPosting(s);

    // Act / Assert
    await expect(insertApplication(workerId, jobId, 'HIRED')).rejects.toThrow();
  });
});

describe('AF8 — REJECTED é um stage válido (migration 123 adicionou ao CHECK)', () => {
  it('deve aceitar INSERT com stage = "REJECTED" (adicionado em migration 123)', async () => {
    // REJECTED foi adicionado ao CHECK constraint em migration 123_reminder_reschedule_flow.sql
    const s = makeSuffix();
    const workerId = await insertTestWorker(s);
    const jobId = await insertTestJobPosting(s);

    // Deve inserir sem erros
    await expect(insertApplication(workerId, jobId, 'REJECTED')).resolves.toBeTruthy();
  });

  it('deve aceitar UPDATE para stage = "REJECTED" em application existente', async () => {
    const s = makeSuffix();
    const workerId = await insertTestWorker(s);
    const jobId = await insertTestJobPosting(s);
    const appId = await insertApplication(workerId, jobId, 'INITIATED');

    // Deve atualizar sem erros
    await expect(
      pool.query(
        'UPDATE worker_job_applications SET application_funnel_stage = $1 WHERE id = $2',
        ['REJECTED', appId],
      ),
    ).resolves.toBeDefined();
  });
});

// ── AF9: Listar applications por stage ────────────────────────────────────────

describe('AF9 — Listar applications por stage', () => {
  it('deve retornar apenas 1 application ao filtrar por QUALIFIED entre 3 em stages distintos', async () => {
    // Arrange — 1 worker, 3 vagas, 3 stages diferentes
    const s = makeSuffix();
    const workerId = await insertTestWorker(s);

    const jobId1 = await insertTestJobPosting(`${s}-job1`);
    const jobId2 = await insertTestJobPosting(`${s}-job2`);
    const jobId3 = await insertTestJobPosting(`${s}-job3`);

    await insertApplication(workerId, jobId1, 'INITIATED');
    await insertApplication(workerId, jobId2, 'QUALIFIED');
    await insertApplication(workerId, jobId3, 'NOT_QUALIFIED');

    // Act — busca apenas stage = QUALIFIED para este worker
    const result = await pool.query(
      `SELECT id FROM worker_job_applications
       WHERE worker_id = $1 AND application_funnel_stage = 'QUALIFIED'`,
      [workerId],
    );

    // Assert
    expect(result.rows.length).toBe(1);
  });

  it('deve retornar 0 applications ao filtrar por stage sem nenhum match', async () => {
    // Arrange
    const s = makeSuffix();
    const workerId = await insertTestWorker(s);
    const jobId = await insertTestJobPosting(s);
    await insertApplication(workerId, jobId, 'INITIATED');

    // Act
    const result = await pool.query(
      `SELECT id FROM worker_job_applications
       WHERE worker_id = $1 AND application_funnel_stage = 'PLACED'`,
      [workerId],
    );

    // Assert
    expect(result.rows.length).toBe(0);
  });

  it('deve retornar todas as 3 applications ao filtrar sem restrição de stage', async () => {
    // Arrange
    const s = makeSuffix();
    const workerId = await insertTestWorker(s);

    const jobId1 = await insertTestJobPosting(`${s}-a`);
    const jobId2 = await insertTestJobPosting(`${s}-b`);
    const jobId3 = await insertTestJobPosting(`${s}-c`);

    await insertApplication(workerId, jobId1, 'IN_PROGRESS');
    await insertApplication(workerId, jobId2, 'COMPLETED');
    await insertApplication(workerId, jobId3, 'IN_DOUBT');

    // Act
    const result = await pool.query(
      'SELECT application_funnel_stage FROM worker_job_applications WHERE worker_id = $1 ORDER BY applied_at',
      [workerId],
    );

    // Assert
    expect(result.rows.length).toBe(3);
    const stages = result.rows.map((r) => r.application_funnel_stage as string);
    expect(stages).toContain('IN_PROGRESS');
    expect(stages).toContain('COMPLETED');
    expect(stages).toContain('IN_DOUBT');
  });
});

// ── AF10: DEFAULT do stage ─────────────────────────────────────────────────────

describe('AF10 — DEFAULT do application_funnel_stage ao INSERT sem especificar', () => {
  it('deve usar o DEFAULT definido na migration (não deve ser um valor antigo como APPLIED)', async () => {
    // Arrange
    const s = makeSuffix();
    const workerId = await insertTestWorker(s);
    const jobId = await insertTestJobPosting(s);

    // Act — INSERT sem especificar application_funnel_stage
    const appId = await insertApplication(workerId, jobId);

    // Assert — qualquer que seja o DEFAULT, deve ser um valor válido da constraint nova
    const stage = await getApplicationStage(appId);
    const VALID_STAGES = ['INITIATED', 'IN_PROGRESS', 'COMPLETED', 'QUALIFIED', 'IN_DOUBT', 'NOT_QUALIFIED', 'PLACED'];
    expect(VALID_STAGES).toContain(stage);

    // E NÃO deve ser nenhum dos valores antigos
    const INVALID_STAGES = ['APPLIED', 'PRE_SCREENING', 'INTERVIEW_SCHEDULED', 'INTERVIEWED', 'HIRED', 'REJECTED'];
    expect(INVALID_STAGES).not.toContain(stage);
  });
});
