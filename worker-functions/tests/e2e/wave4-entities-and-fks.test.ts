/**
 * wave4-entities-and-fks.test.ts
 *
 * Testa os 4 itens do Wave 4 do roadmap de correção de schema,
 * contra o banco real (sem mocks).
 *
 * C3:     Tabela coordinators + FK em 4 tabelas
 * D3+D3B: assignee_uid + recruiter_uid FK users
 * D5:     View workers_without_users (monitoramento)
 * D6:     ON DELETE SET NULL em encuadres/audits + deleted_at em job_postings
 */

import { Pool } from 'pg';

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://enlite_admin:enlite_password@localhost:5432/enlite_e2e';

let pool: Pool;

// UUIDs determinísticos para isolamento do teste
const COORDINATOR_IDS = {
  c1: 'ee440000-0c03-0004-0001-000000000001',
  c2: 'ee440000-0c03-0004-0001-000000000002',
};

const WORKER_IDS = {
  w1: 'ee440000-0c03-0004-0002-000000000001',
  w2: 'ee440000-0c03-0004-0002-000000000002',
};

const JOB_IDS = {
  j1: 'ee440000-0c03-0004-0003-000000000001',
  j2: 'ee440000-0c03-0004-0003-000000000002',
};

const ENCUADRE_IDS = {
  e1: 'ee440000-0c03-0004-0004-000000000001',
};

const AUDIT_IDS = {
  a1: 'ee440000-0c03-0004-0005-000000000001',
};

const PUBLICATION_IDS = {
  p1: 'ee440000-0c03-0004-0006-000000000001',
};

const SCHEDULE_IDS = {
  s1: 'ee440000-0c03-0004-0007-000000000001',
};

const USER_UIDS = {
  admin1: 'e2e-wave4-admin-001',
  admin2: 'e2e-wave4-admin-002',
};

async function cleanupTestData(p: Pool): Promise<void> {
  // FK order: children first
  await p.query(`DELETE FROM worker_placement_audits WHERE id = ANY($1)`, [Object.values(AUDIT_IDS)]);
  await p.query(`DELETE FROM encuadres WHERE id = ANY($1)`, [Object.values(ENCUADRE_IDS)]);
  await p.query(`DELETE FROM publications WHERE id = ANY($1)`, [Object.values(PUBLICATION_IDS)]);
  await p.query(`DELETE FROM coordinator_weekly_schedules WHERE id = ANY($1)`, [Object.values(SCHEDULE_IDS)]);
  await p.query(`DELETE FROM worker_job_applications WHERE worker_id = ANY($1)`, [Object.values(WORKER_IDS)]);
  await p.query(`DELETE FROM job_postings WHERE id = ANY($1)`, [Object.values(JOB_IDS)]);
  await p.query(`DELETE FROM workers WHERE id = ANY($1)`, [Object.values(WORKER_IDS)]);
  await p.query(`DELETE FROM coordinators WHERE id = ANY($1)`, [Object.values(COORDINATOR_IDS)]);
  await p.query(`DELETE FROM users WHERE firebase_uid = ANY($1)`, [Object.values(USER_UIDS)]);
}

beforeAll(async () => {
  pool = new Pool({ connectionString: DATABASE_URL });
  await cleanupTestData(pool);

  // Seed: users (para D3 + D3-B)
  for (const [key, uid] of Object.entries(USER_UIDS)) {
    await pool.query(
      `INSERT INTO users (firebase_uid, email, display_name, role)
       VALUES ($1, $2, $3, 'admin')
       ON CONFLICT (firebase_uid) DO NOTHING`,
      [uid, `${key}@wave4.test`, `Wave4 ${key}`],
    );
  }

  // Seed: workers
  for (const [key, id] of Object.entries(WORKER_IDS)) {
    await pool.query(
      `INSERT INTO workers (id, auth_uid, email, phone, status, country, timezone)
       VALUES ($1, $2, $3, $4, 'REGISTERED', 'AR', 'America/Buenos_Aires')
       ON CONFLICT (auth_uid) DO NOTHING`,
      [id, `e2e-wave4-${key}`, `${key}@wave4.test`, `54114440${key.replace('w', '')}`],
    );
  }

  // Seed: job_postings
  for (const [key, id] of Object.entries(JOB_IDS)) {
    await pool.query(
      `INSERT INTO job_postings (id, title, status, country)
       VALUES ($1, $2, 'ACTIVE', 'AR')
       ON CONFLICT DO NOTHING`,
      [id, `Wave4 test posting ${key}`],
    );
  }
});

afterAll(async () => {
  await cleanupTestData(pool);
  await pool.end();
});

// ═══════════════════════════════════════════════════════════════
// C3 — Tabela coordinators + FK em 4 tabelas
// ═══════════════════════════════════════════════════════════════

describe('C3 — Tabela coordinators', () => {
  it('tabela coordinators existe com colunas corretas', async () => {
    const result = await pool.query<{ column_name: string; data_type: string }>(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'coordinators'
      ORDER BY ordinal_position
    `);

    const columns = result.rows.map(r => r.column_name);
    expect(columns).toContain('id');
    expect(columns).toContain('name');
    expect(columns).toContain('dni');
    expect(columns).toContain('email');
    expect(columns).toContain('is_active');
    expect(columns).toContain('created_at');
    expect(columns).toContain('updated_at');
  });

  it('UNIQUE constraint em coordinators.name funciona', async () => {
    await pool.query(
      `INSERT INTO coordinators (id, name) VALUES ($1, 'Coord Wave4 A')
       ON CONFLICT DO NOTHING`,
      [COORDINATOR_IDS.c1],
    );

    try {
      await pool.query(
        `INSERT INTO coordinators (id, name) VALUES ($1, 'Coord Wave4 A')`,
        [COORDINATOR_IDS.c2],
      );
      fail('INSERT deveria ter falhado com unique_violation');
    } catch (err: any) {
      expect(err.code).toBe('23505'); // unique_violation
    }
  });

  it('INSERT de coordinator com nome único funciona', async () => {
    await pool.query(
      `INSERT INTO coordinators (id, name, dni, email)
       VALUES ($1, 'Coord Wave4 B', '12345678', 'coordb@wave4.test')
       ON CONFLICT DO NOTHING`,
      [COORDINATOR_IDS.c2],
    );

    const result = await pool.query<{ name: string; dni: string }>(
      `SELECT name, dni FROM coordinators WHERE id = $1`,
      [COORDINATOR_IDS.c2],
    );
    expect(result.rows[0].name).toBe('Coord Wave4 B');
    expect(result.rows[0].dni).toBe('12345678');
  });

  it('trigger updated_at funciona em coordinators', async () => {
    const before = await pool.query<{ updated_at: Date }>(
      `SELECT updated_at FROM coordinators WHERE id = $1`,
      [COORDINATOR_IDS.c1],
    );

    await new Promise(resolve => setTimeout(resolve, 10));

    await pool.query(
      `UPDATE coordinators SET email = 'updated@wave4.test' WHERE id = $1`,
      [COORDINATOR_IDS.c1],
    );

    const after = await pool.query<{ updated_at: Date }>(
      `SELECT updated_at FROM coordinators WHERE id = $1`,
      [COORDINATOR_IDS.c1],
    );

    expect(after.rows[0].updated_at.getTime()).toBeGreaterThan(
      before.rows[0].updated_at.getTime(),
    );
  });
});

describe('C3 — FK coordinator_id nas 4 tabelas', () => {
  it('job_postings.coordinator_id existe com FK para coordinators', async () => {
    const result = await pool.query<{ conname: string; consrc: string }>(`
      SELECT conname, pg_get_constraintdef(oid) AS consrc
      FROM pg_constraint
      WHERE conrelid = 'job_postings'::regclass
        AND contype = 'f'
        AND pg_get_constraintdef(oid) LIKE '%coordinators%'
    `);
    expect(result.rows.length).toBeGreaterThanOrEqual(1);
    expect(result.rows[0].consrc).toContain('coordinators');
  });

  it('encuadres.coordinator_id existe com FK para coordinators', async () => {
    const result = await pool.query<{ conname: string; consrc: string }>(`
      SELECT conname, pg_get_constraintdef(oid) AS consrc
      FROM pg_constraint
      WHERE conrelid = 'encuadres'::regclass
        AND contype = 'f'
        AND pg_get_constraintdef(oid) LIKE '%coordinators%'
    `);
    expect(result.rows.length).toBeGreaterThanOrEqual(1);
  });

  it('coordinator_weekly_schedules.coordinator_id existe com FK para coordinators', async () => {
    const result = await pool.query<{ conname: string; consrc: string }>(`
      SELECT conname, pg_get_constraintdef(oid) AS consrc
      FROM pg_constraint
      WHERE conrelid = 'coordinator_weekly_schedules'::regclass
        AND contype = 'f'
        AND pg_get_constraintdef(oid) LIKE '%coordinators%'
    `);
    expect(result.rows.length).toBeGreaterThanOrEqual(1);
  });

  it('worker_placement_audits.coordinator_id existe com FK para coordinators', async () => {
    const result = await pool.query<{ conname: string; consrc: string }>(`
      SELECT conname, pg_get_constraintdef(oid) AS consrc
      FROM pg_constraint
      WHERE conrelid = 'worker_placement_audits'::regclass
        AND contype = 'f'
        AND pg_get_constraintdef(oid) LIKE '%coordinators%'
    `);
    expect(result.rows.length).toBeGreaterThanOrEqual(1);
  });

  it('FK válida: criar job_posting com coordinator_id existente funciona', async () => {
    await pool.query(
      `UPDATE job_postings SET coordinator_id = $1 WHERE id = $2`,
      [COORDINATOR_IDS.c1, JOB_IDS.j1],
    );

    const result = await pool.query<{ coordinator_id: string }>(
      `SELECT coordinator_id FROM job_postings WHERE id = $1`,
      [JOB_IDS.j1],
    );
    expect(result.rows[0].coordinator_id).toBe(COORDINATOR_IDS.c1);

    // Cleanup
    await pool.query(`UPDATE job_postings SET coordinator_id = NULL WHERE id = $1`, [JOB_IDS.j1]);
  });

  it('FK inválida: coordinator_id inexistente retorna ForeignKeyViolation', async () => {
    const fakeId = 'ee440000-dead-beef-0000-000000000000';
    try {
      await pool.query(
        `UPDATE job_postings SET coordinator_id = $1 WHERE id = $2`,
        [fakeId, JOB_IDS.j1],
      );
      fail('UPDATE deveria ter falhado com ForeignKeyViolation');
    } catch (err: any) {
      expect(err.code).toBe('23503'); // foreign_key_violation
    }
  });

  it('JOIN coordinator retorna nome correto', async () => {
    await pool.query(
      `UPDATE job_postings SET coordinator_id = $1 WHERE id = $2`,
      [COORDINATOR_IDS.c1, JOB_IDS.j1],
    );

    const result = await pool.query<{ title: string; coordinator_name: string }>(`
      SELECT jp.title, c.name AS coordinator_name
      FROM job_postings jp
      JOIN coordinators c ON c.id = jp.coordinator_id
      WHERE jp.id = $1
    `, [JOB_IDS.j1]);

    expect(result.rows[0].coordinator_name).toBe('Coord Wave4 A');

    await pool.query(`UPDATE job_postings SET coordinator_id = NULL WHERE id = $1`, [JOB_IDS.j1]);
  });

  it('UNIQUE coordinator_schedule usa coordinator_id', async () => {
    await pool.query(
      `INSERT INTO coordinator_weekly_schedules (id, coordinator_id, coordinator_name, from_date, to_date, weekly_hours)
       VALUES ($1, $2, 'Coord Wave4 A', '2026-01-01', '2026-01-07', 10.5)
       ON CONFLICT DO NOTHING`,
      [SCHEDULE_IDS.s1, COORDINATOR_IDS.c1],
    );

    // Tentar inserir mesmo coordinator_id + período → deve falhar
    try {
      await pool.query(
        `INSERT INTO coordinator_weekly_schedules (coordinator_id, coordinator_name, from_date, to_date, weekly_hours)
         VALUES ($1, 'Coord Wave4 A', '2026-01-01', '2026-01-07', 20.0)`,
        [COORDINATOR_IDS.c1],
      );
      fail('INSERT deveria ter falhado com unique_violation');
    } catch (err: any) {
      expect(err.code).toBe('23505');
    }
  });

  it('encuadre com coordinator_id funciona', async () => {
    await pool.query(
      `INSERT INTO encuadres (id, worker_id, job_posting_id, coordinator_id, coordinator_name, dedup_hash)
       VALUES ($1, $2, $3, $4, 'Coord Wave4 A', 'wave4-enc-hash-001')
       ON CONFLICT DO NOTHING`,
      [ENCUADRE_IDS.e1, WORKER_IDS.w1, JOB_IDS.j1, COORDINATOR_IDS.c1],
    );

    const result = await pool.query<{ coordinator_id: string }>(
      `SELECT coordinator_id FROM encuadres WHERE id = $1`,
      [ENCUADRE_IDS.e1],
    );
    expect(result.rows[0].coordinator_id).toBe(COORDINATOR_IDS.c1);
  });

  it('worker_placement_audit com coordinator_id funciona', async () => {
    await pool.query(
      `INSERT INTO worker_placement_audits (id, audit_id, worker_id, job_posting_id, coordinator_id, coordinator_name, rating)
       VALUES ($1, 'wave4-audit-001', $2, $3, $4, 'Coord Wave4 A', 4)
       ON CONFLICT DO NOTHING`,
      [AUDIT_IDS.a1, WORKER_IDS.w1, JOB_IDS.j1, COORDINATOR_IDS.c1],
    );

    const result = await pool.query<{ coordinator_id: string }>(
      `SELECT coordinator_id FROM worker_placement_audits WHERE id = $1`,
      [AUDIT_IDS.a1],
    );
    expect(result.rows[0].coordinator_id).toBe(COORDINATOR_IDS.c1);
  });
});

// ═══════════════════════════════════════════════════════════════
// D3 + D3-B — assignee_uid e recruiter_uid
// ═══════════════════════════════════════════════════════════════

describe('D3 — job_postings.assignee_uid', () => {
  it('coluna assignee_uid existe com FK para users', async () => {
    const result = await pool.query<{ conname: string; consrc: string }>(`
      SELECT conname, pg_get_constraintdef(oid) AS consrc
      FROM pg_constraint
      WHERE conrelid = 'job_postings'::regclass
        AND contype = 'f'
        AND pg_get_constraintdef(oid) LIKE '%users%'
        AND pg_get_constraintdef(oid) LIKE '%assignee_uid%'
    `);
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].consrc).toContain('users');
    expect(result.rows[0].consrc).toContain('firebase_uid');
  });

  it('FK assignee_uid válida — user existente', async () => {
    await pool.query(
      `UPDATE job_postings SET assignee_uid = $1 WHERE id = $2`,
      [USER_UIDS.admin1, JOB_IDS.j1],
    );

    const result = await pool.query<{ assignee_uid: string }>(
      `SELECT assignee_uid FROM job_postings WHERE id = $1`,
      [JOB_IDS.j1],
    );
    expect(result.rows[0].assignee_uid).toBe(USER_UIDS.admin1);

    await pool.query(`UPDATE job_postings SET assignee_uid = NULL WHERE id = $1`, [JOB_IDS.j1]);
  });

  it('FK assignee_uid inválida retorna ForeignKeyViolation', async () => {
    try {
      await pool.query(
        `UPDATE job_postings SET assignee_uid = 'non-existent-uid-12345' WHERE id = $1`,
        [JOB_IDS.j1],
      );
      fail('UPDATE deveria ter falhado com ForeignKeyViolation');
    } catch (err: any) {
      expect(err.code).toBe('23503');
    }
  });

  it('ON DELETE SET NULL: deletar user seta assignee_uid = NULL', async () => {
    // Criar user temporário
    const tempUid = 'e2e-wave4-temp-delete';
    await pool.query(
      `INSERT INTO users (firebase_uid, email, display_name, role)
       VALUES ($1, 'tempdelete@wave4.test', 'Temp Delete', 'admin')`,
      [tempUid],
    );

    await pool.query(
      `UPDATE job_postings SET assignee_uid = $1 WHERE id = $2`,
      [tempUid, JOB_IDS.j1],
    );

    // Deletar user
    await pool.query(`DELETE FROM users WHERE firebase_uid = $1`, [tempUid]);

    // Verificar que assignee_uid virou NULL
    const result = await pool.query<{ assignee_uid: string | null }>(
      `SELECT assignee_uid FROM job_postings WHERE id = $1`,
      [JOB_IDS.j1],
    );
    expect(result.rows[0].assignee_uid).toBeNull();
  });
});

describe('D3-B — publications.recruiter_uid e encuadres.recruiter_uid', () => {
  it('publications.recruiter_uid existe com FK para users', async () => {
    const result = await pool.query<{ conname: string; consrc: string }>(`
      SELECT conname, pg_get_constraintdef(oid) AS consrc
      FROM pg_constraint
      WHERE conrelid = 'publications'::regclass
        AND contype = 'f'
        AND pg_get_constraintdef(oid) LIKE '%users%'
        AND pg_get_constraintdef(oid) LIKE '%recruiter_uid%'
    `);
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].consrc).toContain('firebase_uid');
  });

  it('encuadres.recruiter_uid existe com FK para users', async () => {
    const result = await pool.query<{ conname: string; consrc: string }>(`
      SELECT conname, pg_get_constraintdef(oid) AS consrc
      FROM pg_constraint
      WHERE conrelid = 'encuadres'::regclass
        AND contype = 'f'
        AND pg_get_constraintdef(oid) LIKE '%users%'
        AND pg_get_constraintdef(oid) LIKE '%recruiter_uid%'
    `);
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].consrc).toContain('firebase_uid');
  });

  it('FK recruiter_uid válida em publications', async () => {
    await pool.query(
      `INSERT INTO publications (id, job_posting_id, channel, recruiter_uid, recruiter_name, dedup_hash)
       VALUES ($1, $2, 'whatsapp', $3, 'Wave4 admin1', 'wave4-pub-hash-001')
       ON CONFLICT DO NOTHING`,
      [PUBLICATION_IDS.p1, JOB_IDS.j1, USER_UIDS.admin1],
    );

    const result = await pool.query<{ recruiter_uid: string }>(
      `SELECT recruiter_uid FROM publications WHERE id = $1`,
      [PUBLICATION_IDS.p1],
    );
    expect(result.rows[0].recruiter_uid).toBe(USER_UIDS.admin1);
  });

  it('FK recruiter_uid válida em encuadres', async () => {
    // Atualizar encuadre criado anteriormente
    await pool.query(
      `UPDATE encuadres SET recruiter_uid = $1, recruiter_name = 'Wave4 admin2' WHERE id = $2`,
      [USER_UIDS.admin2, ENCUADRE_IDS.e1],
    );

    const result = await pool.query<{ recruiter_uid: string }>(
      `SELECT recruiter_uid FROM encuadres WHERE id = $1`,
      [ENCUADRE_IDS.e1],
    );
    expect(result.rows[0].recruiter_uid).toBe(USER_UIDS.admin2);
  });

  it('FK recruiter_uid inválida retorna ForeignKeyViolation', async () => {
    try {
      await pool.query(
        `INSERT INTO publications (job_posting_id, channel, recruiter_uid, dedup_hash)
         VALUES ($1, 'whatsapp', 'non-existent-uid', 'wave4-pub-hash-fail')`,
        [JOB_IDS.j1],
      );
      fail('INSERT deveria ter falhado com ForeignKeyViolation');
    } catch (err: any) {
      expect(err.code).toBe('23503');
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// D5 — View workers_without_users
// ═══════════════════════════════════════════════════════════════

describe('D5 — View workers_without_users', () => {
  it('view workers_without_users existe', async () => {
    const result = await pool.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.views
      WHERE table_schema = 'public'
        AND table_name = 'workers_without_users'
    `);
    expect(result.rows.length).toBe(1);
  });

  it('view retorna workers cujo auth_uid não existe em users', async () => {
    // Nossos workers de teste têm auth_uid 'e2e-wave4-w1', 'e2e-wave4-w2'
    // que NÃO existem na tabela users (os users criados têm UIDs diferentes)
    const result = await pool.query<{ id: string; auth_uid: string }>(`
      SELECT id, auth_uid FROM workers_without_users
      WHERE id = ANY($1)
    `, [Object.values(WORKER_IDS)]);

    // Ambos os workers de teste devem aparecer pois seus auth_uids não são firebase_uids válidos em users
    expect(result.rows.length).toBe(2);
    const authUids = result.rows.map(r => r.auth_uid);
    expect(authUids).toContain('e2e-wave4-w1');
    expect(authUids).toContain('e2e-wave4-w2');
  });

  it('view NÃO retorna workers com user correspondente', async () => {
    // Criar um worker cujo auth_uid = firebase_uid de um user existente
    const matchedWorkerId = 'ee440000-0c03-0004-d500-000000000001';
    await pool.query(
      `INSERT INTO workers (id, auth_uid, email, phone, status, country, timezone)
       VALUES ($1, $2, 'matched@wave4.test', '5411444099', 'REGISTERED', 'AR', 'America/Buenos_Aires')
       ON CONFLICT (auth_uid) DO NOTHING`,
      [matchedWorkerId, USER_UIDS.admin1],
    );

    const result = await pool.query<{ id: string }>(
      `SELECT id FROM workers_without_users WHERE id = $1`,
      [matchedWorkerId],
    );
    expect(result.rows.length).toBe(0);

    // Cleanup
    await pool.query(`DELETE FROM workers WHERE id = $1`, [matchedWorkerId]);
  });
});

// ═══════════════════════════════════════════════════════════════
// D6 — ON DELETE SET NULL + deleted_at
// ═══════════════════════════════════════════════════════════════

describe('D6 — ON DELETE SET NULL em encuadres e worker_placement_audits', () => {
  it('encuadres.job_posting_id FK é ON DELETE SET NULL', async () => {
    const result = await pool.query<{ confdeltype: string }>(`
      SELECT confdeltype
      FROM pg_constraint
      WHERE conrelid = 'encuadres'::regclass
        AND conname = 'encuadres_job_posting_id_fkey'
    `);
    expect(result.rows.length).toBe(1);
    // 'n' = SET NULL, 'c' = CASCADE, 'a' = NO ACTION
    expect(result.rows[0].confdeltype).toBe('n');
  });

  it('worker_placement_audits.job_posting_id FK é ON DELETE SET NULL', async () => {
    const result = await pool.query<{ confdeltype: string }>(`
      SELECT confdeltype
      FROM pg_constraint
      WHERE conrelid = 'worker_placement_audits'::regclass
        AND conname = 'worker_placement_audits_job_posting_id_fkey'
    `);
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].confdeltype).toBe('n');
  });

  it('deletar job_posting: encuadre NÃO é deletado, job_posting_id vira NULL', async () => {
    // Criar job_posting temporário + encuadre
    const tempJobId = 'ee440000-0c03-0004-d600-000000000001';
    const tempEncId = 'ee440000-0c03-0004-d600-000000000002';

    await pool.query(
      `INSERT INTO job_postings (id, title, status, country)
       VALUES ($1, 'Temp D6 Job', 'ACTIVE', 'AR')`,
      [tempJobId],
    );

    await pool.query(
      `INSERT INTO encuadres (id, worker_id, job_posting_id, dedup_hash)
       VALUES ($1, $2, $3, 'wave4-d6-enc-hash')`,
      [tempEncId, WORKER_IDS.w1, tempJobId],
    );

    // Deletar o job_posting
    await pool.query(`DELETE FROM job_postings WHERE id = $1`, [tempJobId]);

    // Encuadre deve existir com job_posting_id = NULL
    const result = await pool.query<{ id: string; job_posting_id: string | null }>(
      `SELECT id, job_posting_id FROM encuadres WHERE id = $1`,
      [tempEncId],
    );
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].job_posting_id).toBeNull();

    // Cleanup
    await pool.query(`DELETE FROM encuadres WHERE id = $1`, [tempEncId]);
  });

  it('deletar job_posting: audit NÃO é deletado, job_posting_id vira NULL', async () => {
    const tempJobId = 'ee440000-0c03-0004-d600-000000000003';
    const tempAuditId = 'ee440000-0c03-0004-d600-000000000004';

    await pool.query(
      `INSERT INTO job_postings (id, title, status, country)
       VALUES ($1, 'Temp D6 Job Audit', 'ACTIVE', 'AR')`,
      [tempJobId],
    );

    await pool.query(
      `INSERT INTO worker_placement_audits (id, audit_id, worker_id, job_posting_id, rating)
       VALUES ($1, 'wave4-d6-audit', $2, $3, 5)`,
      [tempAuditId, WORKER_IDS.w1, tempJobId],
    );

    // Deletar o job_posting
    await pool.query(`DELETE FROM job_postings WHERE id = $1`, [tempJobId]);

    // Audit deve existir com job_posting_id = NULL
    const result = await pool.query<{ id: string; job_posting_id: string | null }>(
      `SELECT id, job_posting_id FROM worker_placement_audits WHERE id = $1`,
      [tempAuditId],
    );
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].job_posting_id).toBeNull();

    // Cleanup
    await pool.query(`DELETE FROM worker_placement_audits WHERE id = $1`, [tempAuditId]);
  });
});

describe('D6 — job_postings.deleted_at (soft delete)', () => {
  it('coluna deleted_at existe em job_postings, TIMESTAMPTZ nullable', async () => {
    const result = await pool.query<{
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }>(`
      SELECT data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'job_postings' AND column_name = 'deleted_at'
    `);

    expect(result.rows.length).toBe(1);
    expect(result.rows[0].data_type).toBe('timestamp with time zone');
    expect(result.rows[0].is_nullable).toBe('YES');
  });

  it('índice parcial idx_job_postings_deleted_at existe', async () => {
    const result = await pool.query<{ indexname: string; indexdef: string }>(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'job_postings'
        AND indexname = 'idx_job_postings_deleted_at'
    `);

    expect(result.rows.length).toBe(1);
    expect(result.rows[0].indexdef).toContain('deleted_at');
    expect(result.rows[0].indexdef).toContain('WHERE');
  });

  it('novos job_postings têm deleted_at = NULL por default', async () => {
    const result = await pool.query<{ deleted_at: Date | null }>(
      `SELECT deleted_at FROM job_postings WHERE id = $1`,
      [JOB_IDS.j1],
    );
    expect(result.rows[0].deleted_at).toBeNull();
  });

  it('soft delete: setar deleted_at funciona', async () => {
    await pool.query(
      `UPDATE job_postings SET deleted_at = NOW() WHERE id = $1`,
      [JOB_IDS.j2],
    );

    const result = await pool.query<{ deleted_at: Date | null }>(
      `SELECT deleted_at FROM job_postings WHERE id = $1`,
      [JOB_IDS.j2],
    );
    expect(result.rows[0].deleted_at).not.toBeNull();

    // Verificar que query com filtro exclui o soft-deleted
    const activeResult = await pool.query<{ id: string }>(
      `SELECT id FROM job_postings WHERE id = ANY($1) AND deleted_at IS NULL`,
      [Object.values(JOB_IDS)],
    );
    const activeIds = activeResult.rows.map(r => r.id);
    expect(activeIds).toContain(JOB_IDS.j1);
    expect(activeIds).not.toContain(JOB_IDS.j2);

    // Restaurar
    await pool.query(`UPDATE job_postings SET deleted_at = NULL WHERE id = $1`, [JOB_IDS.j2]);
  });

  it('soft delete não afeta encuadres relacionados', async () => {
    // Verificar que o encuadre do C3 ainda existe e é acessível
    await pool.query(
      `UPDATE job_postings SET deleted_at = NOW() WHERE id = $1`,
      [JOB_IDS.j1],
    );

    const result = await pool.query<{ id: string; job_posting_id: string }>(
      `SELECT id, job_posting_id FROM encuadres WHERE id = $1`,
      [ENCUADRE_IDS.e1],
    );
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].job_posting_id).toBe(JOB_IDS.j1);

    // Restaurar
    await pool.query(`UPDATE job_postings SET deleted_at = NULL WHERE id = $1`, [JOB_IDS.j1]);
  });
});

// ═══════════════════════════════════════════════════════════════
// Regressão — Validação transversal de schema Wave 4
// ═══════════════════════════════════════════════════════════════

describe('Regressão — Validação transversal Wave 4', () => {
  it('todas as 4 tabelas têm coluna coordinator_id UUID', async () => {
    const tables = [
      'job_postings',
      'encuadres',
      'coordinator_weekly_schedules',
      'worker_placement_audits',
    ];

    for (const table of tables) {
      const result = await pool.query<{ data_type: string }>(`
        SELECT data_type FROM information_schema.columns
        WHERE table_name = $1 AND column_name = 'coordinator_id'
      `, [table]);

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].data_type).toBe('uuid');
    }
  });

  it('nenhuma FK de auditoria com ON DELETE CASCADE referenciando job_postings', async () => {
    // Tabelas de auditoria não devem ter CASCADE para job_postings
    const auditTables = ['encuadres', 'worker_placement_audits'];

    for (const table of auditTables) {
      const result = await pool.query<{ confdeltype: string; conname: string }>(`
        SELECT confdeltype, conname
        FROM pg_constraint
        WHERE conrelid = $1::regclass
          AND contype = 'f'
          AND confrelid = 'job_postings'::regclass
      `, [table]);

      for (const row of result.rows) {
        // 'c' = CASCADE — não deve existir
        expect(row.confdeltype).not.toBe('c');
      }
    }
  });

  it('job_postings.assignee_uid e publications/encuadres.recruiter_uid referenciam users', async () => {
    const checks = [
      { table: 'job_postings', column: 'assignee_uid' },
      { table: 'publications', column: 'recruiter_uid' },
      { table: 'encuadres', column: 'recruiter_uid' },
    ];

    for (const { table, column } of checks) {
      const result = await pool.query<{ confrelid: string }>(`
        SELECT confrelid::regclass::text AS confrelid
        FROM pg_constraint
        WHERE conrelid = $1::regclass
          AND contype = 'f'
          AND pg_get_constraintdef(oid) LIKE $2
      `, [table, `%${column}%`]);

      expect(result.rows.length).toBeGreaterThanOrEqual(1);
      expect(result.rows[0].confrelid).toBe('users');
    }
  });

  it('view workers_without_users tem as colunas esperadas', async () => {
    const result = await pool.query<{ column_name: string }>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'workers_without_users'
      ORDER BY ordinal_position
    `);

    const columns = result.rows.map(r => r.column_name);
    expect(columns).toContain('id');
    expect(columns).toContain('auth_uid');
    expect(columns).toContain('email');
    expect(columns).toContain('created_at');
  });
});
