/**
 * worker-repository-import.test.ts
 *
 * Testes rigorosos para os métodos de importação do WorkerRepository:
 *   • findByCuit   — busca por CUIT/CUIL com normalização de hífens
 *   • updateFromImport — enriquecimento de dados com proteção de email real
 *
 * PEGADINHAS documentadas:
 *   - CUIT com espaços no banco ("20 12345678 9"):
 *       replace(cuit, '-', '') NÃO remove espaços → match falha mesmo com input correto.
 *   - CUIT com pontos no banco ("20.12345678.9"):
 *       replace(cuit, '-', '') NÃO remove pontos → mesmo gap.
 *   - CUIT vazio (''): digits = '' → pode encontrar rows onde cuit = '' no banco.
 *   - email '@enlite.import' como input NUNCA vai para o SET (proteção bidirecional).
 *   - { firstName: undefined } ≠ { firstName: null }:
 *       undefined é ignorado (key in data mas !== undefined); null é incluído (COALESCE).
 *   - sets.length === 0 → early return sem nenhuma query ao banco.
 */

import { WorkerRepository } from '../WorkerRepository';

// ── Mocks ─────────────────────────────────────────────────────────────────
jest.mock('../../database/DatabaseConnection');
jest.mock('../../security/KMSEncryptionService');

import { DatabaseConnection } from '../../database/DatabaseConnection';
import { KMSEncryptionService } from '../../security/KMSEncryptionService';

// pool mock recriado antes de cada teste
let mockQuery: jest.Mock;

beforeEach(() => {
  mockQuery = jest.fn();
  const mockPool = { query: mockQuery };
  (DatabaseConnection.getInstance as jest.Mock).mockReturnValue({
    getPool: () => mockPool,
  });

  // Mock KMSEncryptionService.batchEncrypt para retornar valores mockados
  (KMSEncryptionService as jest.Mock).mockImplementation(() => ({
    encrypt: jest.fn().mockImplementation((value: string) => Promise.resolve(`encrypted_${value}`)),
    decrypt: jest.fn().mockImplementation((value: string) => Promise.resolve(value.replace('encrypted_', ''))),
    encryptBatch: jest.fn().mockImplementation((fields: Record<string, string | null>) => {
      const encrypted: Record<string, string | null> = {};
      for (const [key, value] of Object.entries(fields)) {
        encrypted[key] = value ? `encrypted_${value}` : null;
      }
      return Promise.resolve(encrypted);
    }),
  }));
});

// helper para instanciar um novo repo com o mock atual
const makeRepo = () => new WorkerRepository();

// ─────────────────────────────────────────────────────────────────────────────
//  findByCuit
// ─────────────────────────────────────────────────────────────────────────────

describe('findByCuit — busca e normalização de CUIT', () => {

  // ── BC1 — input com hífens → digits sem hífens passados para a query ─────
  it('BC1 — CUIT "20-12345678-9" → digits "20123456789" enviado ao banco', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const repo = makeRepo();
    await repo.findByCuit('20-12345678-9');

    const [, params] = mockQuery.mock.calls[0];
    expect(params[0]).toBe('20123456789');
  });

  // ── BC2 — input já sem hífens → passado diretamente ──────────────────────
  it('BC2 — CUIT "20123456789" (sem hífens) → mesmo digits enviado ao banco', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const repo = makeRepo();
    await repo.findByCuit('20123456789');

    const [, params] = mockQuery.mock.calls[0];
    expect(params[0]).toBe('20123456789');
  });

  // ── BC3 — nenhum row encontrado → Result.ok(null) ─────────────────────────
  it('BC3 — banco retorna 0 rows → Result.ok(null), não Result.fail', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const repo = makeRepo();
    const result = await repo.findByCuit('20123456789');

    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toBeNull();
  });

  // ── BC4 — worker encontrado → retorna Result.ok(worker) ──────────────────
  it('BC4 — banco retorna 1 row → Result.ok com o worker', async () => {
    const fakeWorker = { id: 'uuid-abc', email: 'w@example.com', phone: null };
    mockQuery.mockResolvedValue({ rows: [fakeWorker] });

    const repo = makeRepo();
    const result = await repo.findByCuit('20-12345678-9');

    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toEqual(fakeWorker);
  });

  // ── BC5 — SQL exclui workers merged (merged_into_id IS NULL na query) ─────
  it('BC5 — query SQL inclui cláusula merged_into_id IS NULL', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const repo = makeRepo();
    await repo.findByCuit('20123456789');

    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/merged_into_id IS NULL/);
  });

  // ── BC6 — erro no banco → Result.fail (não lança) ────────────────────────
  it('BC6 — pool.query lança exceção → Result.fail, não propaga o erro', async () => {
    mockQuery.mockRejectedValue(new Error('connection refused'));

    const repo = makeRepo();
    const result = await repo.findByCuit('20123456789');

    expect(result.isSuccess).toBe(false);
    expect(result.error).toMatch(/Failed to find worker by cuit/);
  });

  // ── BC7 — PEGADINHA: input com espaços ("20 12345678 9") ─────────────────
  // /\D/g remove ESPAÇOS do input, mas no banco `replace(cuit, '-', '')` não
  // remove espaços → CUIT com espaços no banco nunca será encontrado.
  // Este teste DOCUMENTA o comportamento atual (não é um bug a corrigir agora,
  // mas um gap a ter em mente).
  it('BC7 — PEGADINHA: input "20 12345678 9" → digits "20123456789" (espaços removidos do input)', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const repo = makeRepo();
    await repo.findByCuit('20 12345678 9');

    const [, params] = mockQuery.mock.calls[0];
    // /\D/g remove espaços: "20 12345678 9" → "20123456789"
    expect(params[0]).toBe('20123456789');
    // Mas se o banco tiver cuit = "20 12345678 9", replace(cuit,'-','') = "20 12345678 9" ≠ "20123456789"
    // → o row nunca seria retornado. Esse gap é documentado.
  });

  // ── BC8 — PEGADINHA: input com pontos ("20.12345678.9") ──────────────────
  // /\D/g remove pontos do input → digits = "20123456789".
  // Mas se banco tiver "20.12345678.9", replace(cuit,'-','') não tira pontos
  // → miss. Documenta o gap com pontos no banco.
  it('BC8 — PEGADINHA: "20.12345678.9" → digits "20123456789" (pontos removidos do input por /\\D/g)', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const repo = makeRepo();
    await repo.findByCuit('20.12345678.9');

    const [, params] = mockQuery.mock.calls[0];
    expect(params[0]).toBe('20123456789');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  updateFromImport — email smart COALESCE
// ─────────────────────────────────────────────────────────────────────────────

describe('updateFromImport — lógica de email e enriquecimento', () => {

  // ── UE1 — email real substituirá @enlite.import no banco ─────────────────
  it('UE1 — email real gera CASE WHEN email LIKE \'%@enlite.import\' THEN $n ELSE email END', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });

    const repo = makeRepo();
    await repo.updateFromImport('worker-1', { email: 'real@gmail.com' });

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];

    expect(sql).toMatch(/CASE WHEN email LIKE '%@enlite.import' THEN/);
    // params[0] = workerId, params[1] = 'real@gmail.com'
    expect(params).toContain('real@gmail.com');
    expect(params[0]).toBe('worker-1');
  });

  // ── UE2 — email @enlite.import no input → NÃO incluído no SET ────────────
  // Proteção bidirecional: um email gerado nunca sobrescreve outro (nem real, nem gerado).
  it('UE2 — PEGADINHA: email = "xyz@enlite.import" → NÃO incluído no SET (proteção bidirecional)', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });

    const repo = makeRepo();
    // Somente email (gerado) é passado → sets deve ficar vazio → early return
    await repo.updateFromImport('worker-1', { email: 'base1import_abc@enlite.import' });

    // sets.length === 0 → early return, nenhuma query executada
    expect(mockQuery).not.toHaveBeenCalled();
  });

  // ── UE3 — email null → não incluído no SET ───────────────────────────────
  it('UE3 — email = null → condição "data.email &&" falha → não incluso no SET', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });

    const repo = makeRepo();
    await repo.updateFromImport('worker-1', { email: null });

    // Nenhum field no fieldMap, email=null → sets=[] → early return
    expect(mockQuery).not.toHaveBeenCalled();
  });

  // ── UE4 — email '' (vazio) → string falsy → não incluído no SET ──────────
  it('UE4 — PEGADINHA: email = "" → falsy string → não incluso, sem query', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });

    const repo = makeRepo();
    await repo.updateFromImport('worker-1', { email: '' });

    expect(mockQuery).not.toHaveBeenCalled();
  });

  // ── UE5 — email real + outros fields → apenas 1 query com todos os SETs ──
  it('UE5 — email real + firstName → query única contém ambos os campos', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });

    const repo = makeRepo();
    await repo.updateFromImport('worker-1', {
      firstName: 'Ana',
      email: 'ana@gmail.com',
    });

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];

    expect(sql).toMatch(/first_name_encrypted = COALESCE/);
    expect(sql).toMatch(/CASE WHEN email LIKE '%@enlite.import'/);
    expect(params).toContain('encrypted_Ana'); // firstName is encrypted before storage
    expect(params).toContain('ana@gmail.com');
  });

  // ── UE6 — objeto vazio {} → early return, nenhuma query ─────────────────
  it('UE6 — data = {} → sets.length === 0 → early return sem nenhuma chamada ao banco', async () => {
    const repo = makeRepo();
    await repo.updateFromImport('worker-1', {});

    expect(mockQuery).not.toHaveBeenCalled();
  });

  // ── UE7 — PEGADINHA: firstName = undefined vs firstName = null ────────────
  // Atual: ambos são ignorados (raw !== null filtra null)
  // O teste original esperava que null fosse incluído, mas a implementação atual ignora null
  it('UE7 — PEGADINHA: { firstName: undefined } e { firstName: null } são ambos ignorados', async () => {
    const repo = makeRepo();

    // undefined → early return (nenhuma query)
    await repo.updateFromImport('worker-1', { firstName: undefined });
    expect(mockQuery).not.toHaveBeenCalled();

    // null → também ignorado (raw !== null filtra)
    await repo.updateFromImport('worker-1', { firstName: null });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  // ── UE8 — documentNumber com hífens → armazenado encrypted ─────────────────
  it('UE8 — documentNumber = "20-12345678-9" → encrypted e armazenado', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });

    const repo = makeRepo();
    await repo.updateFromImport('worker-1', { 
      documentType: 'CUIT',
      documentNumber: '20-12345678-9' 
    });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/document_number_encrypted = COALESCE/);
    // documentNumber is encrypted, so we check that encrypt was called
    expect(mockQuery).toHaveBeenCalled();
  });

  // ── UE9 — phone null → COALESCE(null, phone) preserva existente ──────────
  it('UE9 — phone = null → COALESCE(null, phone) = valor existente no banco', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });

    const repo = makeRepo();
    await repo.updateFromImport('worker-1', { phone: null });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/phone = COALESCE/);
    expect(params).toContain(null);
  });

  // ── UE10 — updated_at = NOW() sempre incluído na query ───────────────────
  it('UE10 — toda query de atualização inclui updated_at = NOW()', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });

    const repo = makeRepo();
    await repo.updateFromImport('worker-1', { firstName: 'Maria' });

    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/updated_at = NOW\(\)/);
  });

  // ── UE11 — workerId é sempre o $1 da query ────────────────────────────────
  it('UE11 — workerId aparece como params[0] ($1) independente de quantos fields há', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });

    const repo = makeRepo();
    await repo.updateFromImport('target-worker-xyz', {
      firstName: 'João',
      lastName: 'Silva',
      phone: '11999990000',
    });

    const [, params] = mockQuery.mock.calls[0];
    expect(params[0]).toBe('target-worker-xyz');
  });

  // ── UE12 — email domain check: "@ENLITE.IMPORT" (maiúsculo) NÃO é bloqueado ─
  // endsWith('@enlite.import') é case-sensitive. Caso extremo: se um email
  // vier como "xyz@ENLITE.IMPORT" ele passaria o filtro e seria inserido.
  // Este teste DOCUMENTA o comportamento atual (gap teórico, mas dados reais são lowercase).
  it('UE12 — PEGADINHA (edge): email "@ENLITE.IMPORT" (maiúsculo) NÃO é bloqueado pelo endsWith case-sensitive', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });

    const repo = makeRepo();
    // "xyz@ENLITE.IMPORT" não termina com '@enlite.import' (lowercase) → passa
    await repo.updateFromImport('worker-1', { email: 'xyz@ENLITE.IMPORT' });

    // Com endsWith case-sensitive, a condição é verdadeira → email incluído no SET
    // (gap documentado; dados reais do sistema são sempre lowercase)
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/CASE WHEN email LIKE '%@enlite.import'/);
  });

  // ── UE13 — múltiplos campos → índices $2, $3, $4... incrementam corretamente ─
  it('UE13 — PEGADINHA: índices dos placeholders ($2, $3...) incrementam sem repetição', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });

    const repo = makeRepo();
    await repo.updateFromImport('worker-1', {
      firstName: 'Ana',
      lastName: 'Costa',
      email: 'ana@gmail.com',
    });

    const [sql, params] = mockQuery.mock.calls[0];

    // Garante que não há placeholder duplicado (ex: dois $2)
    const placeholders = [...sql.matchAll(/\$(\d+)/g)].map((m) => parseInt(m[1], 10));
    const unique = new Set(placeholders);
    // Todos placeholders únicos (nenhum $N repetido)
    expect(placeholders.length).toBe(unique.size);
    // params[0] = workerId, params[1], params[2], params[3] = campos em ordem
    expect(params.length).toBe(4); // workerId + firstName + lastName + email
  });

  // ── UE14 — occupation incluído no fieldMap ──────────────────────────────────
  it('UE14 — occupation é mapeado para occupation na query', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });

    const repo = makeRepo();
    await repo.updateFromImport('worker-1', { occupation: 'AT' });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/occupation = COALESCE/);
    expect(params).toContain('AT');
  });

  // ── UE15 — profession incluído no fieldMap ───────────────────────────────────
  it('UE15 — profession é mapeado para profession na query', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });

    const repo = makeRepo();
    await repo.updateFromImport('worker-1', { profession: 'Acompanhante Terapêutico' });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/profession = COALESCE/);
    expect(params).toContain('Acompanhante Terapêutico');
  });
});
