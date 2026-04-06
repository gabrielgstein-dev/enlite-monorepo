/**
 * CreateJobPostingFromTalentumUseCase.test.ts
 *
 * Cenarios:
 *  1. Vaga criada com sucesso (caminho feliz)
 *  2. Skip silencioso quando talentum_project_id ja existe (anti-loop)
 *  3. Race condition — erro 23505 tratado como skip
 *  4. Titulo gerado como "CASO {next_case_number}" — data.name e ignorado
 *  5. Status BUSQUEDA e country AR sao sempre usados no INSERT
 *  6. talentum_project_id e talentum_published_at sao salvos no INSERT
 *  7. Erro de DB diferente de 23505 e relancado
 *  8. environment nao e persistido no banco (apenas logging)
 */

import { Pool } from 'pg';
import {
  CreateJobPostingFromTalentumUseCase,
  CreateJobPostingFromTalentumInput,
} from '../CreateJobPostingFromTalentumUseCase';

// ── Helpers ──────────────────────────────────────────────────────

function makeInput(overrides: Partial<CreateJobPostingFromTalentumInput> = {}): CreateJobPostingFromTalentumInput {
  return {
    _id: overrides._id ?? 'talentum-proj-abc123',
    name: overrides.name ?? 'Nome da Vaga Talentum',
  };
}

function makePool(queryImpl: jest.Mock): Pool {
  return { query: queryImpl } as unknown as Pool;
}

// ── Tests ────────────────────────────────────────────────────────

describe('CreateJobPostingFromTalentumUseCase', () => {
  let mockQuery: jest.Mock;

  beforeEach(() => {
    mockQuery = jest.fn();
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── 1. Caminho feliz ─────────────────────────────────────────

  describe('criacao com sucesso', () => {
    it('deve criar job_posting e retornar created=true com jobPostingId e caseNumber', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })                        // SELECT (nao existe)
        .mockResolvedValueOnce({ rows: [{ next: 42 }] })           // MAX(case_number) + 1
        .mockResolvedValueOnce({ rows: [{ id: 'jp-uuid-1' }] });   // INSERT RETURNING id

      const useCase = new CreateJobPostingFromTalentumUseCase(makePool(mockQuery));
      const result = await useCase.execute(makeInput({ _id: 'proj-new' }), 'production');

      expect(result.created).toBe(true);
      expect(result.skipped).toBe(false);
      expect(result.jobPostingId).toBe('jp-uuid-1');
      expect(result.caseNumber).toBe(42);
      expect(result.reason).toBeUndefined();
    });

    it('deve chamar anti-loop SELECT com talentum_project_id correto', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ next: 10 }] })
        .mockResolvedValueOnce({ rows: [{ id: 'jp-x' }] });

      const useCase = new CreateJobPostingFromTalentumUseCase(makePool(mockQuery));
      await useCase.execute(makeInput({ _id: 'my-talentum-id' }), 'production');

      const selectCall = mockQuery.mock.calls[0];
      expect(selectCall[0]).toContain('WHERE talentum_project_id = $1');
      expect(selectCall[1]).toEqual(['my-talentum-id']);
    });

    it('deve usar COALESCE(MAX(case_number), 0) + 1 para gerar o proximo numero', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ next: 1 }] })  // primeiro caso (MAX = 0)
        .mockResolvedValueOnce({ rows: [{ id: 'jp-first' }] });

      const useCase = new CreateJobPostingFromTalentumUseCase(makePool(mockQuery));
      const result = await useCase.execute(makeInput(), 'production');

      expect(result.caseNumber).toBe(1);

      const maxCall = mockQuery.mock.calls[1];
      expect(maxCall[0]).toContain('COALESCE(MAX(case_number), 0) + 1');
    });
  });

  // ── 2. Anti-loop: skip quando ja existe ─────────────────────

  describe('skip por talentum_project_id existente', () => {
    it('deve retornar skipped=true sem fazer INSERT quando ja existe', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'jp-existing' }] }); // SELECT encontra

      const useCase = new CreateJobPostingFromTalentumUseCase(makePool(mockQuery));
      const result = await useCase.execute(makeInput({ _id: 'proj-dup' }), 'production');

      expect(result.created).toBe(false);
      expect(result.skipped).toBe(true);
      expect(result.jobPostingId).toBe('jp-existing');
      expect(result.reason).toBe('already_exists');

      // Deve executar apenas 1 query (SELECT) e nenhum INSERT
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('deve retornar o id do job_posting existente', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'jp-abc-456' }] });

      const useCase = new CreateJobPostingFromTalentumUseCase(makePool(mockQuery));
      const result = await useCase.execute(makeInput(), 'test');

      expect(result.jobPostingId).toBe('jp-abc-456');
    });
  });

  // ── 3. Race condition (23505) ────────────────────────────────

  describe('race condition — unique violation 23505', () => {
    it('deve tratar 23505 como skip e buscar o id inserido concorrentemente', async () => {
      const pgError = Object.assign(new Error('duplicate key value'), { code: '23505' });

      mockQuery
        .mockResolvedValueOnce({ rows: [] })                         // SELECT inicial (nao encontra)
        .mockResolvedValueOnce({ rows: [{ next: 5 }] })             // MAX(case_number)
        .mockRejectedValueOnce(pgError)                              // INSERT — race condition
        .mockResolvedValueOnce({ rows: [{ id: 'jp-race-winner' }] }); // SELECT de recuperacao

      const useCase = new CreateJobPostingFromTalentumUseCase(makePool(mockQuery));
      const result = await useCase.execute(makeInput({ _id: 'proj-race' }), 'production');

      expect(result.created).toBe(false);
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('race_condition');
      expect(result.jobPostingId).toBe('jp-race-winner');
    });

    it('deve fazer SELECT de recuperacao com o mesmo talentum_project_id', async () => {
      const pgError = Object.assign(new Error('duplicate key'), { code: '23505' });

      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ next: 3 }] })
        .mockRejectedValueOnce(pgError)
        .mockResolvedValueOnce({ rows: [{ id: 'jp-recovered' }] });

      const useCase = new CreateJobPostingFromTalentumUseCase(makePool(mockQuery));
      await useCase.execute(makeInput({ _id: 'proj-race-id' }), 'production');

      // 4a query: SELECT de recuperacao
      const recoveryCall = mockQuery.mock.calls[3];
      expect(recoveryCall[0]).toContain('WHERE talentum_project_id = $1');
      expect(recoveryCall[1]).toEqual(['proj-race-id']);
    });
  });

  // ── 4. Titulo gerado corretamente ────────────────────────────

  describe('titulo CASO {N}', () => {
    it('deve usar "CASO {caseNumber}" no INSERT — ignorando data.name', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ next: 99 }] })
        .mockResolvedValueOnce({ rows: [{ id: 'jp-99' }] });

      const useCase = new CreateJobPostingFromTalentumUseCase(makePool(mockQuery));
      await useCase.execute(
        makeInput({ _id: 'proj-99', name: 'Nome Talentum que deve ser ignorado' }),
        'production',
      );

      const insertCall = mockQuery.mock.calls[2];
      const insertParams = insertCall[1] as any[];

      // case_number = 99, title = 'CASO 99'
      expect(insertParams[0]).toBe(99);
      expect(insertParams[1]).toBe('CASO 99');
      // 'Nome Talentum que deve ser ignorado' nao deve aparecer nos params
      expect(insertParams).not.toContain('Nome Talentum que deve ser ignorado');
    });
  });

  // ── 5. Status e country fixos ────────────────────────────────

  describe('status BUSQUEDA e country AR', () => {
    it('deve sempre inserir com status BUSQUEDA e country AR', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ next: 7 }] })
        .mockResolvedValueOnce({ rows: [{ id: 'jp-7' }] });

      const useCase = new CreateJobPostingFromTalentumUseCase(makePool(mockQuery));
      await useCase.execute(makeInput(), 'production');

      const insertCall = mockQuery.mock.calls[2];
      const sql = insertCall[0] as string;

      expect(sql).toContain("'BUSQUEDA'");
      expect(sql).toContain("'AR'");
    });
  });

  // ── 6. talentum_project_id e talentum_published_at no INSERT ─

  describe('referencia Talentum no INSERT', () => {
    it('deve salvar talentum_project_id no INSERT', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ next: 15 }] })
        .mockResolvedValueOnce({ rows: [{ id: 'jp-15' }] });

      const useCase = new CreateJobPostingFromTalentumUseCase(makePool(mockQuery));
      await useCase.execute(makeInput({ _id: 'talentum-xyz' }), 'production');

      const insertCall = mockQuery.mock.calls[2];
      const sql = insertCall[0] as string;
      const params = insertCall[1] as any[];

      expect(sql).toContain('talentum_project_id');
      expect(sql).toContain('talentum_published_at');
      expect(params).toContain('talentum-xyz');
    });

    it('deve usar NOW() para talentum_published_at (sem parametro explicito)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ next: 20 }] })
        .mockResolvedValueOnce({ rows: [{ id: 'jp-20' }] });

      const useCase = new CreateJobPostingFromTalentumUseCase(makePool(mockQuery));
      await useCase.execute(makeInput(), 'production');

      const insertCall = mockQuery.mock.calls[2];
      const sql = insertCall[0] as string;

      // talentum_published_at deve ser NOW() no SQL, nao um parametro $N
      expect(sql).toContain('NOW()');
    });
  });

  // ── 7. Erro de DB nao-23505 e relancado ─────────────────────

  describe('erros inesperados de banco', () => {
    it('deve relancar erros de DB que nao sao unique_violation', async () => {
      const dbError = Object.assign(new Error('connection refused'), { code: '08006' });

      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ next: 50 }] })
        .mockRejectedValueOnce(dbError);

      const useCase = new CreateJobPostingFromTalentumUseCase(makePool(mockQuery));

      await expect(
        useCase.execute(makeInput(), 'production'),
      ).rejects.toThrow('connection refused');
    });

    it('deve relancar erro sem code (nao e erro Postgres)', async () => {
      const genericError = new Error('network error');

      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ next: 50 }] })
        .mockRejectedValueOnce(genericError);

      const useCase = new CreateJobPostingFromTalentumUseCase(makePool(mockQuery));

      await expect(
        useCase.execute(makeInput(), 'production'),
      ).rejects.toThrow('network error');
    });
  });

  // ── 8. environment nao persistido ───────────────────────────

  describe('environment nao persistido', () => {
    it('deve aceitar environment sem salva-lo no banco', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ next: 30 }] })
        .mockResolvedValueOnce({ rows: [{ id: 'jp-30' }] });

      const useCase = new CreateJobPostingFromTalentumUseCase(makePool(mockQuery));
      const result = await useCase.execute(makeInput(), 'test');

      expect(result.created).toBe(true);

      // environment 'test' nao deve aparecer como parametro no INSERT
      const insertCall = mockQuery.mock.calls[2];
      const params = insertCall[1] as any[];
      expect(params).not.toContain('test');
    });

    it('deve funcionar igualmente com environment=production e environment=test', async () => {
      const runWith = async (environment: string) => {
        const q = jest.fn()
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [{ next: 1 }] })
          .mockResolvedValueOnce({ rows: [{ id: 'jp-env' }] });
        return new CreateJobPostingFromTalentumUseCase(makePool(q)).execute(makeInput(), environment);
      };

      const [prodResult, testResult] = await Promise.all([
        runWith('production'),
        runWith('test'),
      ]);

      expect(prodResult.created).toBe(true);
      expect(testResult.created).toBe(true);
    });
  });
});
