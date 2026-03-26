# Roadmap — Upload Status em Tempo Real

> Objetivo: feedback visual do progresso de import similar ao painel de Actions do GitHub,
> sem manter a requisição de upload aberta.

---

## Estado atual (após Fases 1 e 2)

| O que existe | Arquivo |
|---|---|
| `POST /api/import/upload` → 202 + `{importJobId, statusUrl}` | `ImportController.ts` |
| `GET /api/import/status/:id` → `status`, `currentPhase`, `percent`, `results`, `logs` | `ImportController.ts` |
| `ImportJob.status`: `pending \| processing \| done \| error` | `OperationalEntities.ts` |
| `ImportJob.currentPhase`: 8 fases nomeadas | `OperationalEntities.ts` |
| `ImportJob.logs`: array JSONB com até 200 entradas | `OperationalEntities.ts` |
| `onProgress` callback atualiza DB por batch de linhas | `ImportController.ts` |
| `ImportJobRepository.updatePhase()` e `appendLog()` | `OperationalRepositories.ts` |
| Importer emite fase e log em cada etapa do pipeline | `import-planilhas.ts` |

---

## ✅ Fase 1 — Phase Tracking no ImportJob

> **Concluída em 2026-03-25** · 29/29 testes E2E passando

O polling existente passa a retornar `currentPhase` legível. Nenhuma mudança de protocolo.

**Fases implementadas:**
```
upload_received → parsing → importing → post_processing → linking → dedup → done
                                                                          ↘ error
```

**Arquivos alterados:**
- `migrations/056_add_import_phase_and_logs.sql` — `ADD COLUMN current_phase`
- `src/domain/entities/OperationalEntities.ts` — tipo `ImportPhase`
- `src/infrastructure/repositories/OperationalRepositories.ts` — `updatePhase()`
- `src/infrastructure/scripts/import-planilhas.ts` — `emitPhase()` nos pontos-chave
- `src/infrastructure/services/ImportController.ts` — `currentPhase` na resposta

**Testes:** `tests/e2e/import-phase-logs.test.ts`

---

## ✅ Fase 2 — Log Lines Persistidos

> **Concluída em 2026-03-25** · 29/29 testes E2E passando

Frontend pode renderizar um terminal-like com mensagens em tempo real via polling.

**Estrutura de log line:**
```typescript
interface ImportLogLine {
  ts: string;        // ISO timestamp
  level: 'info' | 'warn' | 'error';
  message: string;
}
```

**Implementação:**
- `logs JSONB DEFAULT '[]'` na tabela `import_jobs` (cap de 200 entradas — oldest-first drop)
- `appendLog(id, line)` remove a entrada mais antiga quando `jsonb_array_length >= 200`
- Importer emite: tipo detectado, qtd de linhas, início/fim de cada fase, erros de linha (`warn`), contadores finais
- `getStatus()` retorna `logs[-100:]`

**Arquivos alterados:**
- `migrations/056_add_import_phase_and_logs.sql` — `ADD COLUMN logs JSONB`
- `src/domain/entities/OperationalEntities.ts` — tipo `ImportLogLine`, campo `logs` no `ImportJob`
- `src/infrastructure/repositories/OperationalRepositories.ts` — `appendLog()`
- `src/infrastructure/scripts/import-planilhas.ts` — `emitLog()` nos eventos relevantes
- `src/infrastructure/services/ImportController.ts` — `logs` na resposta

**Testes:** `tests/e2e/import-phase-logs.test.ts`

---

## ✅ Fase 3 — SSE Endpoint (push em tempo real)

> **Concluída em 2026-03-25**

Substituir a necessidade de polling por Server-Sent Events. O cliente abre uma única
conexão e recebe eventos à medida que o import avança.

**Novo endpoint:**
```
GET /api/import/status/:id/stream
```

**Protocolo SSE — tipos de evento:**

| event | data |
|---|---|
| `phase` | `{ phase: ImportPhase, at: string }` |
| `progress` | `{ percent, processedRows, totalRows, workersCreated, ... }` |
| `log` | `{ ts, level, message }` |
| `complete` | resumo final igual ao `getStatus()` |
| `error` | `{ message }` |

**Arquitetura — `ImportEventBus`:**

```
ImportController          ImportEventBus (singleton)          SSE Handler
      |                         |                                  |
      | runImportAsync()        |                                  |
      |─── emitPhase() ────────>| fan-out para todos os          |
      |─── emitProgress() ─────>| listeners do importJobId       |
      |─── emitLog() ──────────>|────────────────────────────────>| write SSE chunk
      |─── emitComplete() ─────>|                                  | close connection
```

**Implementação:**

1. **`ImportEventBus`** — `src/infrastructure/services/ImportEventBus.ts`
   ```typescript
   // Singleton in-memory EventEmitter
   // map: importJobId → Set<(event: ImportEvent) => void>
   class ImportEventBus {
     subscribe(jobId: string, handler: Handler): Unsubscribe
     emit(jobId: string, event: ImportEvent): void
   }
   ```

2. **`ImportController`** — método `streamStatus(req, res)`
   - Seta headers SSE (`Content-Type: text/event-stream`, `Cache-Control: no-cache`)
   - Se job já está `done`/`error`, replica os logs do DB imediatamente e fecha
   - Senão, subscreve no bus e faz pipe dos eventos para `res.write()`
   - Remove listener no `req.on('close')` ou timeout de 10 min

3. **`runImportAsync`** — além de chamar `updateProgress` no DB,
   também emite no bus (custo zero, in-process)

4. **Rota** — adicionar em `src/interfaces/routes/`:
   ```typescript
   app.get('/api/import/status/:id/stream', authMiddleware.requireAuth(),
     (req, res) => importController.streamStatus(req, res));
   ```

**Compatibilidade:** `GET /api/import/status/:id` continua funcionando para polling
e para clientes que não suportam SSE.

---

## ✅ Fase 4 — Contrato para o Frontend

> **Concluída em 2026-03-25**

Documentar o contrato final para o time de frontend (fora do escopo deste repo):

```
1. POST /api/import/upload  (multipart/form-data, field: "file")
   ← 202 { importJobId, statusUrl, streamUrl }

2. GET /api/import/status/:id/stream  (EventSource)
   ← SSE stream com eventos: phase | progress | log | complete | error

3. GET /api/import/status/:id  (fallback polling, JSON)
   ← { status, currentPhase, progress, results, logs, errors, duration }
```

---

## ✅ Fase 5 — Fila de Imports + Cancelamento

> **Concluída em 2026-03-26**

Sem esta fase, múltiplos uploads simultâneos disparam todos em paralelo, saturando o banco.
O objetivo é serializar a execução (FIFO) e permitir cancelar qualquer job — idêntico ao
painel de Actions do GitHub.

---

### Problema não considerado no design inicial

Antes de implementar, revisar os quatro pontos abaixo — cada um afeta diretamente a
implementação:

1. **CHECK constraint no banco** — `import_jobs.status` tem `CHECK (status IN
   ('pending','processing','done','error'))`. A migration deve dropar e recriar o constraint
   para incluir `queued` e `cancelled`. Sem isso, qualquer `UPDATE SET status = 'queued'`
   levanta uma exceção de violação de constraint.

2. **Índice de dedup usa `WHERE status = 'done'`** — o índice único `idx_import_jobs_file_hash`
   só indexa jobs `done`. Consequência: se o mesmo arquivo for enviado enquanto já está
   `queued` ou `processing`, o check de hash atual (`findByFileHash`) não o encontra e um
   segundo job duplicado entra na fila. É necessário adicionar uma query explícita para
   detectar jobs em andamento com o mesmo hash antes de criar o job.

3. **`runImportAsync` deve migrar para `ImportQueue`** — o método está em `ImportController`
   como `private`. Se `ImportQueue` precisar chamá-lo, criará acoplamento circular. A solução
   correta é mover a lógica de execução para `ImportQueue.doRun()`, tornando o controller um
   adaptador HTTP puro que só chama `enqueue()` e `cancel()`.

4. **`CHUNK_SIZE = 100`** — o importer só cede controle a cada 100 linhas (em `flushProgress`).
   A latência máxima de cancelamento é proporcional a ~100 linhas × tempo/linha. Em planilhas
   grandes isso é aceitável (< 2s), mas deve ser documentado. O ponto de checagem de
   `signal.aborted` fica **dentro de `flushProgress`**, que já possui um `setImmediate` —
   não é necessário alterar os loops individuais de cada sub-importer.

---

### Transição de status

```
                  ┌─ processing ─ done
upload → queued ──┤              ↘ error
                  └─ cancelled      (se cancelado antes de começar)

processing ──── cancelled (se cancelado enquanto roda — dados parciais mantidos)
```

---

### Novos endpoints

| Endpoint | Descrição |
|---|---|
| `POST /api/import/cancel/:id` | Cancela job `queued` (imediato) ou `processing` (próxima janela) |
| `GET /api/import/queue` | Lista job em execução + fila ordenada |

**Resposta 202 do upload ganha campo novo:**
```json
{
  "importJobId": "...",
  "statusUrl": "...",
  "streamUrl": "...",
  "queuePosition": 2,
  "message": "Upload recebido. Aguardando na fila (posição 2)."
}
```
`queuePosition: 0` significa que o job iniciou imediatamente.

---

### Novos eventos SSE

| event | data | quando |
|---|---|---|
| `queued` | `{ position, queueLength }` | job entra na fila; e quando a posição muda |
| `cancelled` | `{ by: 'user' \| 'system' }` | job é cancelado |

O helper `consumeSseUntilTerminal` dos testes E2E deve ser atualizado para tratar
`cancelled` como evento terminal (além de `complete` e `error`).

---

### Arquitetura — `ImportQueue` (singleton)

```
ImportController              ImportQueue (singleton)           PlanilhaImporter
      |                              |                                 |
      | enqueue(jobId, buf, file)    |                                 |
      |─────────────────────────────>|                                 |
      |                              | DB: status = 'queued'           |
      |                              | bus: emit 'queued' {position}   |
      |                              |                                 |
      |                              | (slot livre) runNext()          |
      |                              | DB: status = 'processing'       |
      |                              |─── doRun(entry, signal) ───────>|
      |                              |          importBuffer(…, signal)|
      |                              |          flushProgress → check signal.aborted
      |                              |          ← ImportCancelledError |
      |                              | DB: status = 'cancelled'        |
      |                              | bus: emit 'cancelled'           |
      |                              | runNext() → próximo job         |
```

**Não armazenar `queue_position` como coluna.** A posição é calculada dinamicamente
por `ORDER BY created_at WHERE status = 'queued'`. Uma coluna de posição exigiria
atualizações em cascata a cada mudança de fila, o que seria frágil.

---

### Comportamento em caso de restart do servidor

Na inicialização (`importQueue.initialize()` chamado em `src/index.ts`):

```
SELECT * FROM import_jobs WHERE status IN ('queued', 'processing')
  → queued    → UPDATE status = 'cancelled', cancelled_at = NOW()
               → emit log: "Servidor reiniciado. Re-envie o arquivo."
  → processing → UPDATE status = 'error', finished_at = NOW()
               → emit log: "Import interrompido por restart."
```

O arquivo (buffer) não é persistido — só existe em memória durante a execução.
Se o servidor reinicia, o usuário precisa re-enviar o arquivo.
Isso é um trade-off documentado: não requer armazenamento em disco/S3.

---

### Passo a passo de implementação

#### Passo 1 — Migration

Arquivo: `migrations/058_add_import_queue.sql`

```sql
-- 1. Dropar o CHECK constraint existente antes de adicionar novos valores
ALTER TABLE import_jobs
  DROP CONSTRAINT IF EXISTS import_jobs_status_check;

-- 2. Recriar com os novos valores
ALTER TABLE import_jobs
  ADD CONSTRAINT import_jobs_status_check
  CHECK (status IN ('pending', 'processing', 'done', 'error', 'queued', 'cancelled'));

-- 3. Campo de auditoria de cancelamento
ALTER TABLE import_jobs
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ DEFAULT NULL;

-- 4. Índice para recuperação eficiente de jobs na fila (startup recovery + GET /queue)
CREATE INDEX IF NOT EXISTS idx_import_jobs_queued_created
  ON import_jobs (created_at ASC)
  WHERE status = 'queued';
```

**Garantia:** rodar `EXPLAIN` para confirmar que `GET /queue` usa o índice parcial.

---

#### Passo 2 — Entidades e tipos

Arquivo: `src/domain/entities/OperationalEntities.ts`

```typescript
// Antes
export type ImportJobStatus = 'pending' | 'processing' | 'done' | 'error';
export type ImportPhase = 'upload_received' | 'parsing' | 'importing'
  | 'post_processing' | 'linking' | 'dedup' | 'done' | 'error';

// Depois
export type ImportJobStatus = 'pending' | 'processing' | 'done' | 'error'
  | 'queued' | 'cancelled';
export type ImportPhase = 'upload_received' | 'parsing' | 'importing'
  | 'post_processing' | 'linking' | 'dedup' | 'done' | 'error'
  | 'queued' | 'cancelled';

// Adicionar ao ImportJob
cancelledAt: Date | null;
```

---

#### Passo 3 — Repository

Arquivo: `src/infrastructure/repositories/OperationalRepositories.ts`

Métodos novos no `ImportJobRepository`:

```typescript
// Marca job como queued (atualiza status + phase)
async setQueued(id: string): Promise<void>

// Cancela um job — usado pelo ImportQueue
async cancel(id: string): Promise<void>  // status = 'cancelled', cancelled_at = NOW()

// Busca jobs travados em queued/processing no startup (para recovery)
async findStaleInProgress(): Promise<ImportJob[]>  // status IN ('queued','processing')

// Busca job ativo (queued ou processing) com o mesmo hash — prevenção de duplicatas
async findActiveByFileHash(hash: string): Promise<ImportJob | null>
```

**Atenção:** `findByFileHash` existente só busca `status = 'done'` (via índice parcial).
Não alterar — adicionar `findActiveByFileHash` separado que consulta `queued` e `processing`.

---

#### Passo 4 — ImportEventBus — novos tipos de evento

Arquivo: `src/infrastructure/services/ImportEventBus.ts`

```typescript
export type ImportEvent =
  // ... eventos existentes ...
  | { type: 'queued';    position: number; queueLength: number }
  | { type: 'cancelled'; by: 'user' | 'system' };
```

---

#### Passo 5 — ImportCancelledError

Criar dentro de `src/infrastructure/services/ImportQueue.ts`:

```typescript
export class ImportCancelledError extends Error {
  constructor() {
    super('Import cancelado pelo usuário');
    this.name = 'ImportCancelledError';
  }
}
```

---

#### Passo 6 — import-planilhas.ts — suporte a AbortSignal

Arquivo: `src/infrastructure/scripts/import-planilhas.ts`

**Mudança em `importBuffer`:**
```typescript
async importBuffer(
  buffer: Buffer,
  filename: string,
  importJobId: string,
  onProgress?: (p: ImportProgress) => void,
  signal?: AbortSignal,          // ← novo parâmetro opcional
): Promise<ImportProgress[]>
```

Passar `signal` adiante para cada sub-importer (`importAnaCare`, `importClickUp`, etc.)
e para `flushProgress`.

**Mudança em `flushProgress`:**
```typescript
private async flushProgress(
  jobId: string,
  progress: ImportProgress,
  onProgress?: (p: ImportProgress) => void,
  signal?: AbortSignal,          // ← novo parâmetro opcional
): Promise<void> {
  // ... código existente de updateProgress e onProgress ...
  await new Promise<void>(resolve => setImmediate(resolve));  // já existe
  if (signal?.aborted) throw new ImportCancelledError();      // ← adicionar aqui
}
```

**Não alterar os loops individuais.** O check em `flushProgress` cobre todos porque
cada loop chama `flushProgress` a cada `CHUNK_SIZE` linhas.

Também checar entre sub-importers no `importBuffer`:
```typescript
// Entre cada sub-importer em importPlanillaOperativa, importBuffer, etc:
if (signal?.aborted) throw new ImportCancelledError();
```

---

#### Passo 7 — ImportQueue (novo serviço)

Arquivo: `src/infrastructure/services/ImportQueue.ts`

```typescript
interface QueueEntry {
  jobId: string;
  buffer: Buffer;
  filename: string;
  abortController: AbortController;
  enqueuedAt: Date;
}

class ImportQueue {
  private queue: QueueEntry[] = [];
  private running: QueueEntry | null = null;
  private importer = new PlanilhaImporter();
  private importJobRepo = new ImportJobRepository();

  // Chamado no startup — marca jobs travados
  async initialize(): Promise<void>

  // Retorna posição na fila (0 = rodando agora)
  async enqueue(jobId: string, buffer: Buffer, filename: string): Promise<number>

  // 'cancelled_queued' | 'cancelled_running' | 'not_found' | 'already_terminal'
  async cancel(jobId: string): Promise<string>

  // Para GET /api/import/queue
  getState(): { running: object | null; queued: object[] }

  private runNext(): void
  private async doRun(entry: QueueEntry): Promise<void>
    // Contém a lógica atual de ImportController.runImportAsync()
    // Passa entry.abortController.signal para importBuffer()
    // Captura ImportCancelledError → marca cancelled, emite no bus
}

export const importQueue = new ImportQueue();
```

**Importante:** `enqueue()` e `runNext()` são operações síncronas no estado da fila.
O Node.js é single-threaded para código síncrono — não há race condition entre dois
uploads simultâneos chegando ao mesmo tempo.

---

#### Passo 8 — ImportController — simplificação

Arquivo: `src/infrastructure/services/ImportController.ts`

Mudanças:
- **Remover** `runImportAsync()` (migrou para `ImportQueue.doRun()`)
- **Alterar** `uploadAndProcess()`: após criar o job, checar `findActiveByFileHash` antes
  de criar; ao criar, chamar `importQueue.enqueue(importJob.id, buffer, filename)`
- **Adicionar** `cancelJob(req, res)` — chama `importQueue.cancel(req.params.id)`
- **Adicionar** `getQueue(req, res)` — retorna `importQueue.getState()`

```typescript
// Novo check de dedup em uploadAndProcess():
const activeJob = await this.importJobRepo.findActiveByFileHash(fileHash);
if (activeJob) {
  res.status(409).json({
    success: false,
    error: `Arquivo já está sendo processado (job ${activeJob.id}, status: ${activeJob.status})`,
    data: { importJobId: activeJob.id, status: activeJob.status },
  });
  return;
}
```

---

#### Passo 9 — Rotas

Arquivo: `src/interfaces/routes/importRoutes.ts` (ou onde as rotas de import estão)

```typescript
router.post('/cancel/:id', authMiddleware.requireAuth(),
  (req, res) => importController.cancelJob(req, res));

router.get('/queue', authMiddleware.requireAuth(),
  (req, res) => importController.getQueue(req, res));
```

---

#### Passo 10 — Inicialização no servidor

Arquivo: `src/index.ts`

```typescript
// Antes de registrar as rotas, chamar recovery:
await importQueue.initialize();
```

---

### Critérios de aceite

| # | Critério | Como verificar |
|---|---|---|
| 1 | Upload com slot livre → `queuePosition: 0` na resposta 202; job inicia imediatamente | E2E: checar campo na resposta |
| 2 | Upload com outro job rodando → `queuePosition >= 1`, job fica `status: queued` | E2E: subir 2 uploads simultâneos |
| 3 | Jobs executam em ordem FIFO — nunca dois em `processing` ao mesmo tempo | E2E: polling de ambos os jobs |
| 4 | Mesmo arquivo com job `queued` ou `processing` → 409 Conflict | E2E: re-upload idêntico |
| 5 | `POST /cancel/:id` em job `queued` → status `cancelled`, `cancelledAt` preenchido, nenhuma linha inserida | E2E: cancel imediato + verificar DB |
| 6 | `POST /cancel/:id` em job `processing` → para em ≤ 100 linhas, status `cancelled`, dados parciais mantidos | E2E: upload grande + cancel |
| 7 | `POST /cancel/:id` em job `done`/`error`/`cancelled` → 409 | E2E: cancel após conclusão |
| 8 | `POST /cancel/:id` em UUID inexistente → 404 | E2E: UUID aleatório |
| 9 | SSE de job `queued` emite `queued` com `position` e `queueLength` imediatamente | E2E: consumeSseUntilTerminal |
| 10 | Quando job à frente termina, subscriber do próximo recebe `queued` com posição atualizada | E2E: dois streams abertos simultâneos |
| 11 | SSE de job cancelado emite `cancelled` e fecha | E2E: consumeSseUntilTerminal (tratar `cancelled` como terminal) |
| 12 | `GET /api/import/queue` retorna `{ running, queued[] }` com estrutura correta | E2E: checar schema da resposta |
| 13 | Restart do servidor: jobs `queued` → `cancelled`, `processing` → `error` | Teste de integração ou reset manual |
| 14 | Dados de linhas já processadas antes do cancelamento NÃO são revertidos | E2E: contar workers/encuadres no banco após cancel |

---

### Testes E2E necessários

Arquivo: `tests/e2e/import-queue.test.ts`

**Atualização prévia obrigatória:** `consumeSseUntilTerminal` em `import-sse.test.ts`
deve tratar `cancelled` como evento terminal (linha `if (currentEvent === 'complete' || currentEvent === 'error' || currentEvent === 'cancelled')`).

**Suites e casos:**

```
describe('GET /api/import/queue')
  ✓ retorna { running, queued } quando nada está rodando (running: null, queued: [])
  ✓ retorna job em running quando há import ativo
  ✓ retorna jobs na fila com position, filename, enqueuedAt

describe('Upload serial — fila FIFO')
  ✓ dois uploads de arquivos diferentes → segundo tem queuePosition >= 1
  ✓ status do segundo job é 'queued' imediatamente após upload
  ✓ quando primeiro job termina, segundo muda para 'processing'
  ✓ nunca dois jobs em 'processing' simultaneamente

describe('Dedup de hash em andamento')
  ✓ re-upload do mesmo arquivo com job 'queued' → 409
  ✓ re-upload do mesmo arquivo com job 'processing' → 409
  ✓ re-upload do mesmo arquivo com job 'done' → 200 alreadyImported (comportamento atual mantido)

describe('POST /api/import/cancel/:id')
  ✓ cancel de job 'queued' → 200, status 'cancelled', cancelledAt preenchido
  ✓ cancel de job 'queued' → próximo job inicia automaticamente (se houver)
  ✓ cancel de job 'processing' → status muda para 'cancelled' (polling até confirmar)
  ✓ cancel de job 'done' → 409 Conflict
  ✓ cancel de job 'error' → 409 Conflict
  ✓ cancel de job já 'cancelled' → 409 Conflict
  ✓ cancel de UUID inexistente → 404

describe('SSE — eventos de fila')
  ✓ stream de job 'queued' emite evento 'queued' com { position, queueLength }
  ✓ quando job à frente termina, stream do seguinte recebe 'queued' com position reduzida
  ✓ stream de job cancelado emite evento 'cancelled' e fecha
  ✓ tipos de evento válidos incluem 'queued' e 'cancelled'

describe('Integridade dos dados após cancelamento')
  ✓ workers inseridos antes do cancel continuam no banco após o cancel
```

**Fixtures necessárias:** dois arquivos de teste com hashes distintos para simular
uploads simultâneos. Usar `talentum_sample.csv` e `ana_care_sample.xlsx` que já existem.

---

### O que garantir antes de considerar concluída

- [ ] `CHUNK_SIZE` documentado no código como limite de latência de cancelamento
- [ ] `ImportCancelledError` não propaga para o log de erros como erro inesperado (catch distinto)
- [ ] `initialize()` é idempotente — pode ser chamado múltiplas vezes sem efeito colateral
- [ ] `importQueue.cancel()` é thread-safe pelo modelo de event loop do Node.js (documentar no código)
- [ ] Testes E2E do SSE (`import-sse.test.ts`) continuam passando — `queued`/`cancelled` não quebram os tipos `VALID_EVENT_TYPES` existentes
- [ ] `GET /api/import/history` mostra jobs `cancelled` corretamente (sem alteração de código, mas validar)

---

## ✅ Fase 6 — Paginação do Histórico

> **Concluída em 2026-03-26**

`GET /api/import/history` agora suporta paginação e filtro de status — base para a
tela de histórico estilo GitHub Actions no frontend.

**Query params:**

| Param | Tipo | Default | Descrição |
|---|---|---|---|
| `page` | int ≥ 1 | 1 | Número da página |
| `limit` | int 1–100 | 20 | Itens por página |
| `status` | string | — | Filtra por status: `pending \| processing \| queued \| done \| error \| cancelled` |

**Resposta:**
```json
{
  "success": true,
  "data": [
    {
      "id": "...",
      "filename": "planilha.xlsx",
      "status": "done",
      "currentPhase": "done",
      "workersCreated": 42,
      "encuadresCreated": 18,
      "encuadresSkipped": 3,
      "errorRows": 1,
      "createdBy": "admin@enlite.health",
      "createdAt": "2026-03-25T20:00:00Z",
      "startedAt": "2026-03-25T20:00:02Z",
      "finishedAt": "2026-03-25T20:00:35Z",
      "cancelledAt": null,
      "duration": "33s"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 52,
    "totalPages": 3,
    "hasNext": true,
    "hasPrev": false
  }
}
```

**Validações:**
- `page < 1` → 400
- `limit < 1` ou `limit > 100` → 400
- `status` fora dos valores válidos → 400
- Página além do total → 200 com `data: []`

**Arquivos alterados:**
- `src/infrastructure/repositories/OperationalRepositories.ts` — `listPaginated()`, `count()`
- `src/infrastructure/services/ImportController.ts` — `getHistory()` reescrito

**Testes:** `tests/e2e/import-history.test.ts` — 18 casos cobrindo estrutura, defaults, limit, page, status e ordenação

---

## Sequência de implementação

```
✅ Fase 1  →  ✅ Fase 2  →  ✅ Fase 3  →  ✅ Fase 4  →  ✅ Fase 5  →  ✅ Fase 6
  DB + entity   logs no DB    SSE push      doc contrato  fila + cancel  paginação
  concluída     concluída     concluída     concluída     concluída     concluída
```

Cada fase é independentemente útil:
- ✅ Fase 1: polling retorna fase legível — frontend sabe o que está acontecendo
- ✅ Fase 2: polling rico o suficiente para um terminal-like
- ✅ Fase 3: elimina polling — push em tempo real via SSE
- ✅ Fase 4: contrato documentado para o frontend
- ✅ Fase 5: serializa imports, evita saturação do banco, permite cancelar
- ✅ Fase 6: `GET /api/import/history` paginado com filtro de status — suporta tela estilo GitHub Actions

---

## Arquivos criados/modificados

| Arquivo | Status | Tipo de mudança |
|---|---|---|
| `migrations/056_add_import_phase_and_logs.sql` | ✅ | novo |
| `src/domain/entities/OperationalEntities.ts` | ✅ | `ImportPhase`, `ImportLogLine`, `ImportJob` |
| `src/infrastructure/repositories/OperationalRepositories.ts` | ✅ | `updatePhase`, `appendLog`, `mapRow` |
| `src/infrastructure/services/ImportController.ts` | ✅ | `currentPhase` e `logs` na resposta |
| `src/infrastructure/scripts/import-planilhas.ts` | ✅ | `emitPhase()`, `emitLog()`, instrumentação |
| `tests/e2e/import-phase-logs.test.ts` | ✅ | novo — 12 testes E2E |
| `docker-compose.yml` | ✅ | `USE_KMS_ENCRYPTION=false` para local |
| `src/infrastructure/services/ImportEventBus.ts` | ✅ | novo (Fase 3) |
| `src/index.ts` | ✅ | nova rota SSE + streamUrl (Fase 3/4) |
| `tests/e2e/import-sse.test.ts` | ✅ | novo — testes E2E SSE (Fase 3/4) |
| `migrations/058_add_import_queue.sql` | ✅ | novo (Fase 5) |
| `src/domain/entities/OperationalEntities.ts` | ✅ | `queued`/`cancelled` nos tipos (Fase 5) |
| `src/infrastructure/repositories/OperationalRepositories.ts` | ✅ | `setQueued`, `cancel`, `findActiveByFileHash`, `findStaleInProgress` (Fase 5) |
| `src/infrastructure/services/ImportEventBus.ts` | ✅ | eventos `queued` e `cancelled` (Fase 5) |
| `src/infrastructure/services/ImportQueue.ts` | ✅ | novo singleton — fila + AbortController (Fase 5) |
| `src/infrastructure/services/ImportController.ts` | ✅ | enqueue, cancelJob, getQueue; remove runImportAsync (Fase 5) |
| `src/infrastructure/scripts/import-planilhas.ts` | ✅ | AbortSignal em importBuffer + flushProgress (Fase 5) |
| `src/index.ts` | ✅ | rotas cancel + queue + `importQueue.initialize()` no startup (Fase 5) |
| `tests/e2e/import-queue.test.ts` | ✅ | novo — testes E2E fila e cancelamento (Fase 5) |
| `src/infrastructure/repositories/OperationalRepositories.ts` | ✅ | `listPaginated`, `count` (Fase 6) |
| `src/infrastructure/services/ImportController.ts` | ✅ | `getHistory` paginado + filtro `?status=` (Fase 6) |
| `tests/e2e/import-history.test.ts` | ✅ | novo — testes E2E paginação (Fase 6) |
