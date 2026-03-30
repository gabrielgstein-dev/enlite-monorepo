/**
 * wave8-gap-fixes.test.ts
 *
 * Testa os 5 gaps pendentes do roadmap de correção de schema,
 * contra o banco real (sem mocks).
 *
 * GAP 1 — N1:   WorkerOccupation enum alinhado com banco (AT, CAREGIVER, NURSE, KINESIOLOGIST, PSYCHOLOGIST)
 * GAP 2 — N8-C: blacklist.reason_encrypted / detail_encrypted existem (PII clínico)
 * GAP 3 — D7:   SET LOCAL app.current_uid preenche changed_by em worker_status_history
 * GAP 4 — D8:   messaging_variable_tokens integrado (tokenização + resolução)
 * GAP 5 — N8:   COMMENTs nos campos _raw de encuadres e blacklist
 */

import { Pool } from 'pg';

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://enlite_admin:enlite_password@localhost:5432/enlite_e2e';

let pool: Pool;

// Deterministic UUIDs for test isolation (wave8 prefix)
const IDS = {
  worker1: 'ee880000-0008-0008-0001-000000000001',
  worker2: 'ee880000-0008-0008-0001-000000000002',
  worker3: 'ee880000-0008-0008-0001-000000000003',
  job1:    'ee880000-0008-0008-0002-000000000001',
};

async function cleanupTestData(p: Pool): Promise<void> {
  const workerIds = [IDS.worker1, IDS.worker2, IDS.worker3];
  await p.query(`DELETE FROM worker_status_history WHERE worker_id = ANY($1)`, [workerIds]).catch(() => {});
  await p.query(`DELETE FROM messaging_variable_tokens WHERE worker_id = ANY($1)`, [workerIds]).catch(() => {});
  await p.query(`DELETE FROM messaging_outbox WHERE worker_id = ANY($1)`, [workerIds]).catch(() => {});
  await p.query(`DELETE FROM worker_job_applications WHERE job_posting_id = ANY($1)`, [[IDS.job1]]).catch(() => {});
  await p.query(`DELETE FROM encuadres WHERE worker_id = ANY($1)`, [workerIds]).catch(() => {});
  await p.query(`DELETE FROM blacklist WHERE worker_id = ANY($1)`, [workerIds]).catch(() => {});
  await p.query(`DELETE FROM job_postings WHERE id = ANY($1)`, [[IDS.job1]]).catch(() => {});
  await p.query(`DELETE FROM workers WHERE id = ANY($1)`, [workerIds]).catch(() => {});
}

let workerCounter = 0;
async function createTestWorker(
  p: Pool,
  id: string,
  phone: string,
  overrides: Record<string, unknown> = {},
): Promise<void> {
  workerCounter++;
  const authUid = overrides.auth_uid ?? `e2e-wave8-uid-${workerCounter}-${Date.now()}`;
  const email = overrides.email ?? `wave8-${workerCounter}@test.local`;
  const occupation = overrides.occupation ?? null;
  const overallStatus = overrides.overall_status ?? 'ACTIVE';
  await p.query(
    `INSERT INTO workers (id, auth_uid, email, phone, status, overall_status, occupation, country, timezone)
     VALUES ($1, $2, $3, $4, 'approved', $5, $6, 'AR', 'America/Buenos_Aires')
     ON CONFLICT (id) DO NOTHING`,
    [id, authUid, email, phone, overallStatus, occupation],
  );
}

beforeAll(async () => {
  pool = new Pool({ connectionString: DATABASE_URL });
  await cleanupTestData(pool);
});

afterAll(async () => {
  await cleanupTestData(pool);
  await pool.end();
});

// =================================================================
// GAP 1 — N1: WorkerOccupation enum alinhado com banco
// =================================================================

describe('GAP 1 — N1: WorkerOccupation enum alignment', () => {
  afterEach(async () => {
    await pool.query(`DELETE FROM workers WHERE id = ANY($1)`, [
      [IDS.worker1, IDS.worker2, IDS.worker3],
    ]).catch(() => {});
  });

  // ---- COM DADOS ----

  it('aceita todos os 5 valores válidos do enum: AT, CAREGIVER, NURSE, KINESIOLOGIST, PSYCHOLOGIST', async () => {
    const validValues = ['AT', 'CAREGIVER', 'NURSE', 'KINESIOLOGIST', 'PSYCHOLOGIST'];

    for (let i = 0; i < validValues.length; i++) {
      const val = validValues[i];
      const id = `ee880000-0008-0008-a100-00000000000${i + 1}`;
      await pool.query(
        `INSERT INTO workers (id, auth_uid, email, phone, status, overall_status, occupation, country, timezone)
         VALUES ($1, $2, $3, $4, 'approved', 'ACTIVE', $5, 'AR', 'America/Buenos_Aires')`,
        [id, `e2e-w8-occ-${val}`, `occ-${val}@wave8.test`, `541188800${10 + i}`, val],
      );

      const result = await pool.query<{ occupation: string }>(
        `SELECT occupation FROM workers WHERE id = $1`,
        [id],
      );
      expect(result.rows[0].occupation).toBe(val);

      await pool.query(`DELETE FROM workers WHERE id = $1`, [id]);
    }
  });

  it('CHECK constraint rejeita valor legacy CARER', async () => {
    await expect(
      pool.query(
        `INSERT INTO workers (id, auth_uid, email, phone, status, overall_status, occupation, country, timezone)
         VALUES ($1, 'e2e-w8-carer', 'carer@wave8.test', '54118880099', 'approved', 'ACTIVE', 'CARER', 'AR', 'America/Buenos_Aires')`,
        [IDS.worker1],
      ),
    ).rejects.toMatchObject({ code: '23514' }); // check_violation
  });

  it('CHECK constraint rejeita valor legacy STUDENT', async () => {
    await expect(
      pool.query(
        `INSERT INTO workers (id, auth_uid, email, phone, status, overall_status, occupation, country, timezone)
         VALUES ($1, 'e2e-w8-student', 'student@wave8.test', '54118880098', 'approved', 'ACTIVE', 'STUDENT', 'AR', 'America/Buenos_Aires')`,
        [IDS.worker1],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('CHECK constraint rejeita valor legacy BOTH', async () => {
    await expect(
      pool.query(
        `INSERT INTO workers (id, auth_uid, email, phone, status, overall_status, occupation, country, timezone)
         VALUES ($1, 'e2e-w8-both', 'both@wave8.test', '54118880097', 'approved', 'ACTIVE', 'BOTH', 'AR', 'America/Buenos_Aires')`,
        [IDS.worker1],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  // ---- SEM DADOS ----

  it('worker sem occupation (NULL) é aceito', async () => {
    await createTestWorker(pool, IDS.worker1, '+5491188800001');
    const result = await pool.query(
      `SELECT occupation FROM workers WHERE id = $1`,
      [IDS.worker1],
    );
    expect(result.rows[0].occupation).toBeNull();
  });

  it('nenhum worker com CUIDADOR existe no banco', async () => {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM workers WHERE occupation = 'CUIDADOR'`,
    );
    expect(result.rows[0].cnt).toBe(0);
  });

  it('nenhum worker com AMBOS existe no banco', async () => {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM workers WHERE occupation = 'AMBOS'`,
    );
    expect(result.rows[0].cnt).toBe(0);
  });

  it('CHECK constraints de occupation e profession são idênticos', async () => {
    const result = await pool.query(`
      SELECT conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conrelid = 'workers'::regclass
        AND contype = 'c'
        AND (conname LIKE '%occupation%' OR conname LIKE '%profession%')
      ORDER BY conname
    `);

    // Ambos devem existir
    const occupationCheck = result.rows.find((r: any) => r.conname.includes('occupation'));
    const professionCheck = result.rows.find((r: any) => r.conname.includes('profession'));

    expect(occupationCheck).toBeDefined();
    expect(professionCheck).toBeDefined();

    // Ambos devem conter os mesmos 5 valores
    for (const val of ['AT', 'CAREGIVER', 'NURSE', 'KINESIOLOGIST', 'PSYCHOLOGIST']) {
      expect(occupationCheck!.def).toContain(val);
      expect(professionCheck!.def).toContain(val);
    }
  });
});

// =================================================================
// GAP 2 — N8-C: blacklist PII encryption columns
// =================================================================

describe('GAP 2 — N8-C: blacklist.reason_encrypted e detail_encrypted', () => {
  afterEach(async () => {
    await pool.query(`DELETE FROM blacklist WHERE worker_id = $1`, [IDS.worker1]).catch(() => {});
    await pool.query(`DELETE FROM workers WHERE id = $1`, [IDS.worker1]).catch(() => {});
  });

  // ---- COM DADOS ----

  it('colunas reason_encrypted e detail_encrypted existem em blacklist', async () => {
    const result = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'blacklist'
         AND column_name IN ('reason_encrypted', 'detail_encrypted')
       ORDER BY column_name`,
    );
    const cols = result.rows.map((r: any) => r.column_name);
    expect(cols).toContain('detail_encrypted');
    expect(cols).toContain('reason_encrypted');
  });

  it('colunas _encrypted são TEXT nullable', async () => {
    const result = await pool.query(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_name = 'blacklist'
         AND column_name IN ('reason_encrypted', 'detail_encrypted')
       ORDER BY column_name`,
    );

    for (const row of result.rows) {
      expect(row.data_type).toBe('text');
      expect(row.is_nullable).toBe('YES');
    }
  });

  it('colunas _encrypted têm COMMENT com referência KMS', async () => {
    const result = await pool.query(`
      SELECT col_description('blacklist'::regclass, a.attnum) AS comment,
             a.attname
      FROM pg_attribute a
      WHERE a.attrelid = 'blacklist'::regclass
        AND a.attname IN ('reason_encrypted', 'detail_encrypted')
      ORDER BY a.attname
    `);

    for (const row of result.rows) {
      expect(row.comment).toBeTruthy();
      expect(row.comment).toMatch(/KMS/i);
    }
  });

  it('INSERT com reason_encrypted funciona', async () => {
    await createTestWorker(pool, IDS.worker1, '+5491188800010');

    await pool.query(
      `INSERT INTO blacklist (worker_id, reason, detail, reason_encrypted, detail_encrypted)
       VALUES ($1, 'TEST_REASON', 'test detail', 'enc_reason_cipher', 'enc_detail_cipher')`,
      [IDS.worker1],
    );

    const result = await pool.query(
      `SELECT reason_encrypted, detail_encrypted FROM blacklist WHERE worker_id = $1`,
      [IDS.worker1],
    );
    expect(result.rows[0].reason_encrypted).toBe('enc_reason_cipher');
    expect(result.rows[0].detail_encrypted).toBe('enc_detail_cipher');
  });

  // ---- SEM DADOS ----

  it('INSERT sem reason_encrypted aceita NULL', async () => {
    await createTestWorker(pool, IDS.worker1, '+5491188800011');

    await pool.query(
      `INSERT INTO blacklist (worker_id, reason, detail)
       VALUES ($1, 'TEST_NULL', 'test detail null')`,
      [IDS.worker1],
    );

    const result = await pool.query(
      `SELECT reason_encrypted, detail_encrypted FROM blacklist WHERE worker_id = $1 AND reason = 'TEST_NULL'`,
      [IDS.worker1],
    );
    expect(result.rows[0].reason_encrypted).toBeNull();
    expect(result.rows[0].detail_encrypted).toBeNull();
  });

  it('migration 089 registrada em schema_migrations', async () => {
    const result = await pool.query(
      `SELECT filename FROM schema_migrations WHERE filename LIKE '%089%'`,
    );
    expect(result.rows).toHaveLength(1);
  });
});

// =================================================================
// GAP 3 — D7: SET LOCAL app.current_uid preenche changed_by
// =================================================================

describe('GAP 3 — D7: SET LOCAL app.current_uid → changed_by', () => {
  afterEach(async () => {
    await pool.query(`DELETE FROM worker_status_history WHERE worker_id = $1`, [IDS.worker1]).catch(() => {});
    await pool.query(`DELETE FROM workers WHERE id = $1`, [IDS.worker1]).catch(() => {});
  });

  // ---- COM DADOS (com SET LOCAL) ----

  it('changed_by é preenchido quando SET LOCAL app.current_uid é executado antes do UPDATE', async () => {
    await createTestWorker(pool, IDS.worker1, '+5491188800020', { overall_status: 'PRE_TALENTUM' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL app.current_uid = 'admin-uid-test-d7'");
      await client.query(
        `UPDATE workers SET overall_status = 'QUALIFIED' WHERE id = $1`,
        [IDS.worker1],
      );
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    const result = await pool.query(
      `SELECT changed_by, old_value, new_value, field_name
       FROM worker_status_history
       WHERE worker_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [IDS.worker1],
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].changed_by).toBe('admin-uid-test-d7');
    expect(result.rows[0].field_name).toBe('overall_status');
    expect(result.rows[0].old_value).toBe('PRE_TALENTUM');
    expect(result.rows[0].new_value).toBe('QUALIFIED');
  });

  it('múltiplas mudanças de status são registradas com changed_by correto', async () => {
    await createTestWorker(pool, IDS.worker1, '+5491188800021', { overall_status: 'PRE_TALENTUM' });

    // Primeira mudança
    const client1 = await pool.connect();
    try {
      await client1.query('BEGIN');
      await client1.query("SET LOCAL app.current_uid = 'admin-1'");
      await client1.query(
        `UPDATE workers SET overall_status = 'QUALIFIED' WHERE id = $1`,
        [IDS.worker1],
      );
      await client1.query('COMMIT');
    } finally {
      client1.release();
    }

    // Segunda mudança
    const client2 = await pool.connect();
    try {
      await client2.query('BEGIN');
      await client2.query("SET LOCAL app.current_uid = 'admin-2'");
      await client2.query(
        `UPDATE workers SET overall_status = 'ACTIVE' WHERE id = $1`,
        [IDS.worker1],
      );
      await client2.query('COMMIT');
    } finally {
      client2.release();
    }

    const result = await pool.query(
      `SELECT changed_by, new_value FROM worker_status_history
       WHERE worker_id = $1
       ORDER BY created_at ASC`,
      [IDS.worker1],
    );

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].changed_by).toBe('admin-1');
    expect(result.rows[0].new_value).toBe('QUALIFIED');
    expect(result.rows[1].changed_by).toBe('admin-2');
    expect(result.rows[1].new_value).toBe('ACTIVE');
  });

  // ---- SEM DADOS (sem SET LOCAL) ----

  it('changed_by é NULL quando SET LOCAL NÃO é executado', async () => {
    await createTestWorker(pool, IDS.worker1, '+5491188800022', { overall_status: 'PRE_TALENTUM' });

    // UPDATE sem SET LOCAL — simula código legado
    await pool.query(
      `UPDATE workers SET overall_status = 'QUALIFIED' WHERE id = $1`,
      [IDS.worker1],
    );

    const result = await pool.query(
      `SELECT changed_by FROM worker_status_history
       WHERE worker_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [IDS.worker1],
    );

    expect(result.rows).toHaveLength(1);
    // Sem SET LOCAL, changed_by deve ser NULL ou string vazia
    expect(result.rows[0].changed_by === null || result.rows[0].changed_by === '').toBe(true);
  });

  it('UPDATE sem mudança de status NÃO gera registro em worker_status_history', async () => {
    await createTestWorker(pool, IDS.worker1, '+5491188800023', { overall_status: 'ACTIVE' });

    // UPDATE que não muda overall_status
    await pool.query(
      `UPDATE workers SET occupation = 'AT' WHERE id = $1`,
      [IDS.worker1],
    );

    const result = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM worker_status_history
       WHERE worker_id = $1 AND field_name = 'overall_status'`,
      [IDS.worker1],
    );
    expect(result.rows[0].cnt).toBe(0);
  });
});

// =================================================================
// GAP 4 — D8: messaging_variable_tokens integração
// =================================================================

describe('GAP 4 — D8: messaging_variable_tokens integração funcional', () => {
  afterEach(async () => {
    await pool.query(`DELETE FROM messaging_variable_tokens WHERE worker_id = $1`, [IDS.worker1]).catch(() => {});
    await pool.query(`DELETE FROM messaging_outbox WHERE worker_id = $1`, [IDS.worker1]).catch(() => {});
    await pool.query(`DELETE FROM workers WHERE id = $1`, [IDS.worker1]).catch(() => {});
  });

  // ---- COM DADOS ----

  it('gerar token e armazenar no outbox com JSONB tokenizado', async () => {
    await createTestWorker(pool, IDS.worker1, '+5491188800030');

    // Gerar token
    await pool.query(
      `INSERT INTO messaging_variable_tokens (token, field_name, worker_id)
       VALUES ('tk_wave8_phone_test', 'worker_phone', $1)`,
      [IDS.worker1],
    );

    // Gravar no outbox com token (não o telefone real)
    await pool.query(
      `INSERT INTO messaging_outbox (worker_id, template_slug, variables)
       VALUES ($1, 'wave8_token_test', '{"phone": "tk_wave8_phone_test", "greeting": "Hola"}')`,
      [IDS.worker1],
    );

    const result = await pool.query(
      `SELECT variables FROM messaging_outbox
       WHERE worker_id = $1 AND template_slug = 'wave8_token_test'`,
      [IDS.worker1],
    );

    // JSONB deve conter token, não telefone real
    const vars = result.rows[0].variables;
    expect(vars.phone).toBe('tk_wave8_phone_test');
    expect(vars.greeting).toBe('Hola');
    // Telefone real NÃO deve aparecer
    expect(JSON.stringify(vars)).not.toContain('+5491188800030');
  });

  it('resolver token retorna dados do worker via JOIN', async () => {
    await createTestWorker(pool, IDS.worker1, '+5491188800031');

    await pool.query(
      `INSERT INTO messaging_variable_tokens (token, field_name, worker_id)
       VALUES ('tk_wave8_resolve', 'worker_phone', $1)`,
      [IDS.worker1],
    );

    // Simula resolução: JOIN token → worker
    const result = await pool.query(
      `SELECT w.phone
       FROM messaging_variable_tokens mvt
       JOIN workers w ON w.id = mvt.worker_id
       WHERE mvt.token = 'tk_wave8_resolve'
         AND mvt.expires_at > NOW()`,
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].phone).toBe('+5491188800031');
  });

  it('token expirado NÃO é resolvido', async () => {
    await createTestWorker(pool, IDS.worker1, '+5491188800032');

    // Token expirado
    await pool.query(
      `INSERT INTO messaging_variable_tokens (token, field_name, worker_id, expires_at)
       VALUES ('tk_wave8_expired', 'worker_phone', $1, NOW() - INTERVAL '1 hour')`,
      [IDS.worker1],
    );

    const result = await pool.query(
      `SELECT w.phone
       FROM messaging_variable_tokens mvt
       JOIN workers w ON w.id = mvt.worker_id
       WHERE mvt.token = 'tk_wave8_expired'
         AND mvt.expires_at > NOW()`,
    );

    expect(result.rows).toHaveLength(0);
  });

  it('CASCADE: deletar worker remove tokens', async () => {
    await createTestWorker(pool, IDS.worker1, '+5491188800033');

    await pool.query(
      `INSERT INTO messaging_variable_tokens (token, field_name, worker_id)
       VALUES ('tk_wave8_cascade', 'worker_phone', $1)`,
      [IDS.worker1],
    );

    await pool.query(`DELETE FROM workers WHERE id = $1`, [IDS.worker1]);

    const result = await pool.query(
      `SELECT * FROM messaging_variable_tokens WHERE token = 'tk_wave8_cascade'`,
    );
    expect(result.rows).toHaveLength(0);
  });

  // ---- SEM DADOS ----

  it('outbox sem tokens funciona normalmente (variables sem tk_ prefix)', async () => {
    await createTestWorker(pool, IDS.worker1, '+5491188800034');

    await pool.query(
      `INSERT INTO messaging_outbox (worker_id, template_slug, variables)
       VALUES ($1, 'wave8_no_token_test', '{"greeting": "Hola", "status": "active"}')`,
      [IDS.worker1],
    );

    const result = await pool.query(
      `SELECT variables FROM messaging_outbox
       WHERE worker_id = $1 AND template_slug = 'wave8_no_token_test'`,
      [IDS.worker1],
    );

    expect(result.rows[0].variables.greeting).toBe('Hola');
    expect(result.rows[0].variables.status).toBe('active');
  });

  it('outbox com variables vazio funciona', async () => {
    await createTestWorker(pool, IDS.worker1, '+5491188800035');

    await pool.query(
      `INSERT INTO messaging_outbox (worker_id, template_slug, variables)
       VALUES ($1, 'wave8_empty_vars', '{}')`,
      [IDS.worker1],
    );

    const result = await pool.query(
      `SELECT variables FROM messaging_outbox
       WHERE worker_id = $1 AND template_slug = 'wave8_empty_vars'`,
      [IDS.worker1],
    );

    expect(result.rows[0].variables).toEqual({});
  });
});

// =================================================================
// GAP 5 — N8: COMMENTs nos campos _raw
// =================================================================

describe('GAP 5 — N8: COMMENTs nos campos _raw', () => {
  // ---- COM DADOS (com COMMENTs) ----

  it('encuadres.worker_raw_name tem COMMENT', async () => {
    const result = await pool.query(`
      SELECT col_description('encuadres'::regclass, a.attnum) AS comment
      FROM pg_attribute a
      WHERE a.attrelid = 'encuadres'::regclass AND a.attname = 'worker_raw_name'
    `);
    expect(result.rows[0].comment).toBeTruthy();
    expect(result.rows[0].comment).toMatch(/audit trail/i);
  });

  it('encuadres.worker_raw_phone tem COMMENT', async () => {
    const result = await pool.query(`
      SELECT col_description('encuadres'::regclass, a.attnum) AS comment
      FROM pg_attribute a
      WHERE a.attrelid = 'encuadres'::regclass AND a.attname = 'worker_raw_phone'
    `);
    expect(result.rows[0].comment).toBeTruthy();
    expect(result.rows[0].comment).toMatch(/audit trail/i);
  });

  it('encuadres.occupation_raw tem COMMENT', async () => {
    const result = await pool.query(`
      SELECT col_description('encuadres'::regclass, a.attnum) AS comment
      FROM pg_attribute a
      WHERE a.attrelid = 'encuadres'::regclass AND a.attname = 'occupation_raw'
    `);
    expect(result.rows[0].comment).toBeTruthy();
    expect(result.rows[0].comment).toMatch(/audit trail/i);
  });

  it('blacklist.worker_raw_name tem COMMENT', async () => {
    const result = await pool.query(`
      SELECT col_description('blacklist'::regclass, a.attnum) AS comment
      FROM pg_attribute a
      WHERE a.attrelid = 'blacklist'::regclass AND a.attname = 'worker_raw_name'
    `);
    expect(result.rows[0].comment).toBeTruthy();
    expect(result.rows[0].comment).toMatch(/audit trail/i);
  });

  it('blacklist.worker_raw_phone tem COMMENT', async () => {
    const result = await pool.query(`
      SELECT col_description('blacklist'::regclass, a.attnum) AS comment
      FROM pg_attribute a
      WHERE a.attrelid = 'blacklist'::regclass AND a.attname = 'worker_raw_phone'
    `);
    expect(result.rows[0].comment).toBeTruthy();
    expect(result.rows[0].comment).toMatch(/audit trail/i);
  });

  // ---- SEM DADOS (campos sem COMMENT preexistente) ----

  it('migration 090 registrada em schema_migrations', async () => {
    const result = await pool.query(
      `SELECT filename FROM schema_migrations WHERE filename LIKE '%090%'`,
    );
    expect(result.rows).toHaveLength(1);
  });

  it('COMMENTs contêm indicação de somente leitura', async () => {
    const result = await pool.query(`
      SELECT a.attname,
             col_description('encuadres'::regclass, a.attnum) AS comment
      FROM pg_attribute a
      WHERE a.attrelid = 'encuadres'::regclass
        AND a.attname IN ('worker_raw_name', 'worker_raw_phone', 'occupation_raw')
    `);

    for (const row of result.rows) {
      expect(row.comment).toMatch(/somente leitura|read.only/i);
    }
  });
});

// =================================================================
// REGRESSION — Wave 8 schema integrity
// =================================================================

describe('Regression — Wave 8 schema integrity', () => {
  it('nenhum worker com occupation legacy (CARER, STUDENT, BOTH, CUIDADOR, AMBOS)', async () => {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM workers
       WHERE occupation IN ('CARER', 'STUDENT', 'BOTH', 'CUIDADOR', 'AMBOS')`,
    );
    expect(result.rows[0].cnt).toBe(0);
  });

  it('tabela worker_status_history existe e tem coluna changed_by', async () => {
    const result = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'worker_status_history' AND column_name = 'changed_by'`,
    );
    expect(result.rows).toHaveLength(1);
  });

  it('trigger trg_worker_status_history existe em workers', async () => {
    const result = await pool.query(
      `SELECT tgname FROM pg_trigger
       WHERE tgname = 'trg_worker_status_history'
         AND tgrelid = 'workers'::regclass`,
    );
    expect(result.rows).toHaveLength(1);
  });

  it('blacklist tem colunas encrypted para reason e detail', async () => {
    const result = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'blacklist'
         AND column_name LIKE '%_encrypted'
       ORDER BY column_name`,
    );
    const cols = result.rows.map((r: any) => r.column_name);
    expect(cols).toContain('detail_encrypted');
    expect(cols).toContain('reason_encrypted');
  });

  it('todos os 5 campos _raw têm COMMENTs não-nulos', async () => {
    const fields = [
      { table: 'encuadres', column: 'worker_raw_name' },
      { table: 'encuadres', column: 'worker_raw_phone' },
      { table: 'encuadres', column: 'occupation_raw' },
      { table: 'blacklist', column: 'worker_raw_name' },
      { table: 'blacklist', column: 'worker_raw_phone' },
    ];

    for (const { table, column } of fields) {
      const result = await pool.query(`
        SELECT col_description($1::regclass, a.attnum) AS comment
        FROM pg_attribute a
        WHERE a.attrelid = $1::regclass AND a.attname = $2
      `, [table, column]);
      expect(result.rows[0]?.comment).toBeTruthy();
    }
  });
});
