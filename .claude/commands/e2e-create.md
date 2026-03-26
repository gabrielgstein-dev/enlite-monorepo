# Skill: E2E Create — Gerar testes E2E para nova feature

## Contexto
Analisar o que foi implementado na sessão e gerar ou atualizar testes E2E seguindo
os padrões do projeto. Executar SEMPRE que um controller, route, use case, converter
ou migration for criado/modificado sem teste E2E correspondente.

---

## Protocolo

### Passo 1 — Identificar o que foi implementado
```bash
git diff HEAD --name-only
git ls-files --others --exclude-standard
```
Classificar cada arquivo alterado por tipo:
- `src/interfaces/controllers/` → novo endpoint HTTP
- `src/interfaces/routes/` → novas rotas registradas
- `src/application/` → novo use case
- `src/infrastructure/converters/` → nova fonte de import
- `migrations/` → novo schema de banco
- `src/domain/entities/` → nova entidade de domínio

### Passo 2 — Mapear para arquivo de teste
| Tipo de mudança | Arquivo de teste alvo |
|---|---|
| Novo endpoint `/api/admin/` | `tests/e2e/recruitment-api.test.ts` ou novo arquivo |
| Novo endpoint `/api/workers/` | `tests/e2e/worker-flow.test.ts` ou `profile-tabs.test.ts` |
| Novo endpoint `/api/import/` | `tests/e2e/import-pipeline.test.ts` |
| Novo Converter | `tests/e2e/import-pipeline.test.ts` (nova seção `describe`) |
| Novo fluxo SSE | `tests/e2e/import-sse.test.ts` |
| Auth/middleware | `tests/e2e/admin-access-control.test.ts` |
| Nova tabela (migration) | Novo arquivo `tests/e2e/<nome-da-feature>.test.ts` |

Quando criar arquivo novo vs adicionar `describe` ao existente:
- **Novo arquivo**: feature com domínio claramente distinto (ex: prescreening, matchmaking)
- **Nova seção**: extensão de domínio já coberto (ex: novo campo em worker-flow)

### Passo 3 — Estrutura padrão de arquivo novo
```typescript
/**
 * <feature>.test.ts
 *
 * <Uma linha descrevendo o que este arquivo testa>
 * Usa MockAuth (USE_MOCK_AUTH=true) — sem Firebase real.
 */
import { Pool } from 'pg';
import { createApiClient, getMockToken, waitForBackend } from './helpers';

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://enlite_admin:enlite_password@localhost:5432/enlite_e2e';

describe('<Nome da Feature>', () => {
  let api: ReturnType<typeof createApiClient>;
  let adminToken: string;
  let workerToken: string;
  let pool: Pool;

  beforeAll(async () => {
    await waitForBackend();
    api = createApiClient();
    adminToken  = await getMockToken({ uid: 'admin-uid',  email: 'admin@test.com',  role: 'admin' });
    workerToken = await getMockToken({ uid: 'worker-uid', email: 'worker@test.com', role: 'worker' });
    pool = new Pool({ connectionString: DATABASE_URL });
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('<subdomínio ou happy path>', () => {
    it('deve <comportamento esperado>', async () => {
      // arrange
      // act
      const res = await api.get('/api/...', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      // assert
      expect(res.status).toBe(200);
    });

    it('deve retornar 401 sem token', async () => {
      const res = await api.get('/api/...');
      expect(res.status).toBe(401);
    });

    it('deve retornar 403 para role não autorizado', async () => {
      const res = await api.get('/api/...', {
        headers: { Authorization: `Bearer ${workerToken}` },
      });
      expect(res.status).toBe(403);
    });
  });
});
```

### Passo 4 — Cobertura mínima por tipo de endpoint

**Endpoint CRUD (GET/POST/PUT/DELETE):**
- [ ] Happy path com status correto (200/201/204)
- [ ] Sem auth → 401
- [ ] Role sem permissão → 403
- [ ] Persistência: query direta via `pool` verifica o registro no banco
- [ ] Paginação se o endpoint aceitar `page`/`limit` (incluir page=0 → 400)

**Endpoint de import (`POST /api/import/upload`):**
- [ ] Upload retorna 202 com `importJobId` + `statusUrl`
- [ ] Poll `GET /api/import/status/:id` até `status=done`
- [ ] Verificar linhas persistidas no banco via `pool`
- [ ] Linha com dado inválido acumula erro mas não para o import
- [ ] Sem auth → 401

**Schema/migration (nova tabela):**
- [ ] Tabela existe (`information_schema.tables`)
- [ ] Colunas e tipos corretos (`information_schema.columns`)
- [ ] Constraints CHECK e UNIQUE presentes
- [ ] Upsert idempotente: inserir 2x = 1 registro (`ON CONFLICT`)
- [ ] Cascade delete se aplicável

**Novo Converter:**
- [ ] Upload do fixture específico retorna 202
- [ ] Após `done`: verificar entidade criada no banco com campos corretos
- [ ] Criar fixture em `tests/e2e/fixtures/` se não existir

### Passo 5 — Registrar no jest.config.e2e.js (se arquivo novo)
O jest.config.e2e.js usa `roots: ['<rootDir>/tests/e2e']` com glob `**/*.test.ts`,
então **não é necessário registrar** — o novo arquivo é detectado automaticamente.

### Passo 6 — Executar
Após gerar o teste, invocar `/e2e-run` com escopo do arquivo criado:
```bash
npx jest --config jest.config.e2e.js --testPathPattern="<nome-do-arquivo>"
```
Se falhar → aplicar `e2e-repair` automaticamente.
