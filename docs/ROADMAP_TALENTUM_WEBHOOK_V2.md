# Roadmap — Talentum Webhook v2 (Novo Envelope + Criacao de Vagas Inbound)

> Adaptar o webhook da Talentum para o novo formato envelope (`action` + `subtype` + `data`) e suportar o evento `PRESCREENING.CREATED` que cria vagas automaticamente no banco Enlite quando originadas na Talentum.

---

## Status Geral

| Step | Escopo | Status |
|------|--------|--------|
| **Step 1** | Backend: Novo Zod schema com envelope + discriminated union | DONE |
| **Step 2** | Backend: Refatorar controller para rotear por `action` | DONE |
| **Step 3** | Backend: Adaptar `ProcessTalentumPrescreening` para novo formato | DONE |
| **Step 4** | Backend: Novo use case `CreateJobPostingFromTalentum` | DONE |
| **Step 5** | QA: Testes E2E cobrindo ambos os eventos | DONE |

---

## Contexto

### Formato antigo (sera descontinuado pela Talentum)
```json
{
  "prescreening": { "id": "...", "name": "...", "status": "ANALYZED" },
  "profile": { "id": "...", "firstName": "...", ... },
  "response": { "id": "...", "state": [...], "score": 87, "statusLabel": "QUALIFIED" }
}
```

### Novo formato (envelope unico para todos os eventos)
```json
{
  "action": "PRESCREENING" | "PRESCREENING_RESPONSE",
  "subtype": "CREATED" | "INITIATED" | "IN_PROGRESS" | "COMPLETED" | "ANALYZED",
  "data": { ... }
}
```

### Matriz de eventos

| action | subtype | Descricao | Handler |
|--------|---------|-----------|---------|
| `PRESCREENING` | `CREATED` | Nova vaga criada na Talentum | **NOVO** — `CreateJobPostingFromTalentum` |
| `PRESCREENING_RESPONSE` | `INITIATED` | Candidato iniciou prescreening | Existente — `ProcessTalentumPrescreening` |
| `PRESCREENING_RESPONSE` | `IN_PROGRESS` | Candidato respondendo perguntas | Existente — `ProcessTalentumPrescreening` |
| `PRESCREENING_RESPONSE` | `COMPLETED` | Candidato terminou prescreening | Existente — `ProcessTalentumPrescreening` |
| `PRESCREENING_RESPONSE` | `ANALYZED` | IA analisou e atribuiu score/status | Existente — `ProcessTalentumPrescreening` |

### Problema do loop (PRESCREENING.CREATED)

```
Enlite cria vaga → publica na Talentum (API outbound)
                         |
                  Talentum cria prescreening
                         |
              Talentum dispara webhook PRESCREENING.CREATED → Enlite
                         |
              Enlite recebe → ja tem talentum_project_id → SKIP (anti-loop)
```

**Protecao em 3 camadas:**

| Camada | Mecanismo |
|--------|-----------|
| Inbound (webhook) | `findByTalentumProjectId(data._id)` — se ja existe, skip |
| Outbound (publish) | Guard `talentum_project_id IS NOT NULL` → 409 |
| Banco | `idx_job_postings_talentum_project_id` UNIQUE impede duplos |

---

## Decisoes

| # | Pergunta | Decisao |
|---|----------|---------|
| 1 | Retrocompatibilidade com formato antigo? | **NAO** — Talentum vai enviar apenas formato novo |
| 2 | Status da vaga criada via webhook? | **ATIVA** (status = `BUSQUEDA`) |
| 3 | Nome da vaga (data.name do Talentum)? | **IGNORADO** — titulo sempre `CASO {next_case_number}` |
| 4 | Migration necessaria? | **NAO** — todas as colunas ja existem |

---

## Step 1 — Novo Zod schema com envelope + discriminated union

**Status:** PENDENTE

### Objetivo
Substituir o schema flat atual por um schema que valida o envelope `{ action, subtype, data }` e discrimina o formato do `data` conforme o `action`.

### Arquivo a modificar

| Arquivo | Mudanca |
|---------|---------|
| `worker-functions/src/interfaces/webhooks/validators/talentumPrescreeningSchema.ts` | Substituir schema flat por envelope com discriminated union |

### Schema proposto

```typescript
// Envelope base
const TalentumEnvelopeBase = z.object({
  action: z.enum(['PRESCREENING', 'PRESCREENING_RESPONSE']),
  subtype: z.enum(['CREATED', 'INITIATED', 'IN_PROGRESS', 'COMPLETED', 'ANALYZED']),
});

// Data para PRESCREENING.CREATED
const PrescreeningCreatedData = z.object({
  _id: z.string(),
  name: z.string(),
});

// Data para PRESCREENING_RESPONSE.* (mesmo formato do handler atual)
const PrescreeningResponseData = z.object({
  prescreening: z.object({
    id: z.string(),
    name: z.string(),
  }),
  profile: z.object({
    id: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    email: z.string(),
    phoneNumber: z.string(),
    cuil: z.string().optional(),
    registerQuestions: z.array(z.object({
      questionId: z.string(),
      question: z.string(),
      answer: z.string(),
    })).optional(),
  }),
  response: z.object({
    id: z.string(),
    state: z.array(z.object({
      questionId: z.string(),
      question: z.string(),
      answer: z.string(),
    })),
    score: z.number().optional(),
    statusLabel: z.enum(['QUALIFIED', 'NOT_QUALIFIED', 'PENDING']).optional(),
  }),
});

// Discriminated union via action
const TalentumPrescreeningCreated = TalentumEnvelopeBase.extend({
  action: z.literal('PRESCREENING'),
  subtype: z.literal('CREATED'),
  data: PrescreeningCreatedData,
});

const TalentumPrescreeningResponse = TalentumEnvelopeBase.extend({
  action: z.literal('PRESCREENING_RESPONSE'),
  subtype: z.enum(['INITIATED', 'IN_PROGRESS', 'COMPLETED', 'ANALYZED']),
  data: PrescreeningResponseData,
});

export const TalentumWebhookPayloadSchema = z.discriminatedUnion('action', [
  TalentumPrescreeningCreated,
  TalentumPrescreeningResponse,
]);
```

### Notas
- **Sem `.strict()`** no envelope (forward-compatibility para novos campos futuros)
- `PrescreeningResponseData` mantém a mesma estrutura do schema atual, apenas sem o campo `status` dentro de `prescreening` (agora vem no `subtype`)
- Exportar tipos derivados: `TalentumPrescreeningCreatedPayload`, `TalentumPrescreeningResponsePayload`

### Criterios de aceite
- [ ] Schema rejeita payload sem `action` ou `subtype`
- [ ] Schema aceita `PRESCREENING.CREATED` com `{ _id, name }`
- [ ] Schema aceita `PRESCREENING_RESPONSE.*` com `{ prescreening, profile, response }`
- [ ] Schema rejeita combinacao invalida (ex: `action=PRESCREENING, subtype=ANALYZED`)
- [ ] `statusLabel` e `score` sao opcionais (presentes apenas em ANALYZED)
- [ ] `cuil` e `registerQuestions` sao opcionais

---

## Step 2 — Refatorar controller para rotear por action

**Status:** PENDENTE

### Objetivo
O controller deve validar o envelope e rotear para o use case correto com base no `action`.

### Arquivo a modificar

| Arquivo | Mudanca |
|---------|---------|
| `worker-functions/src/interfaces/webhooks/controllers/TalentumWebhookController.ts` | Validar envelope, rotear por `action` |

### Fluxo proposto

```typescript
async handlePrescreening(req: Request, res: Response) {
  const parsed = TalentumWebhookPayloadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error });

  const { action, subtype, data } = parsed.data;
  const environment = req.environment; // injetado pelo middleware

  if (action === 'PRESCREENING') {
    // PRESCREENING.CREATED → criar job_posting
    await this.createJobPostingFromTalentum.execute(data, environment);
    return res.status(200).json({ ok: true, event: 'PRESCREENING.CREATED' });
  }

  if (action === 'PRESCREENING_RESPONSE') {
    // Adaptar: subtype vira o "status" que o use case existente espera
    await this.processTalentumPrescreening.execute(data, subtype, environment);
    return res.status(200).json({ ok: true, event: `PRESCREENING_RESPONSE.${subtype}` });
  }
}
```

### Notas
- A rota (`POST /api/webhooks/talentum/prescreening`) nao muda
- A autenticacao (`PartnerAuthMiddleware`) nao muda
- O controller recebe um novo use case (`CreateJobPostingFromTalentum`) via injecao

### Criterios de aceite
- [ ] `PRESCREENING.CREATED` roteia para `CreateJobPostingFromTalentum`
- [ ] `PRESCREENING_RESPONSE.*` roteia para `ProcessTalentumPrescreening` existente
- [ ] Retorna 400 para payloads invalidos com mensagem de erro do Zod
- [ ] Retorna 200 com identificador do evento processado
- [ ] Ambiente (`production`/`test`) continua sendo injetado corretamente

---

## Step 3 — Adaptar `ProcessTalentumPrescreening` para novo formato

**Status:** PENDENTE

### Objetivo
Ajustar o use case existente para receber `data` (sem envelope) e `subtype` como status, em vez de esperar o formato flat com `prescreening.status`.

### Arquivo a modificar

| Arquivo | Mudanca |
|---------|---------|
| `worker-functions/src/application/usecases/ProcessTalentumPrescreening.ts` | Receber `subtype` como parametro separado em vez de ler `prescreening.status` |

### Mudancas especificas

1. **Assinatura do metodo**: `execute(data, subtype, environment)` em vez de `execute(payload, environment)`
2. **Mapeamento de status**: onde antes lia `payload.prescreening.status`, agora usa `subtype` diretamente (os valores sao os mesmos: `INITIATED`, `IN_PROGRESS`, `COMPLETED`, `ANALYZED`)
3. **Acesso aos dados**: onde antes lia `payload.prescreening.id`, agora le `data.prescreening.id` (mesmo path, so removeu a camada do envelope)

### Notas
- O fluxo interno (resolver worker, resolver job_posting, upsert prescreening, upsert application, emitir evento) **nao muda**
- A logica de matching por nome (`prescreening.name` → ILIKE em `job_postings.title`) permanece igual
- A criacao automatica de worker (quando nao encontrado por email/phone/cuil) permanece igual

### Criterios de aceite
- [ ] Use case processa `PRESCREENING_RESPONSE.INITIATED` corretamente
- [ ] Use case processa `PRESCREENING_RESPONSE.ANALYZED` com score e statusLabel
- [ ] Transicao para `QUALIFIED` continua emitindo domain event
- [ ] Upsert em `talentum_prescreenings` continua idempotente
- [ ] Auto-criacao de worker continua funcionando
- [ ] `environment` (`production`/`test`) continua sendo salvo

---

## Step 4 — Novo use case `CreateJobPostingFromTalentum`

**Status:** PENDENTE

### Objetivo
Processar o evento `PRESCREENING.CREATED` criando uma vaga ativa no banco Enlite quando ela nao existe, com protecao anti-loop.

### Arquivos a criar/modificar

| Arquivo | Tipo | Descricao |
|---------|------|-----------|
| `worker-functions/src/application/use-cases/CreateJobPostingFromTalentumUseCase.ts` | CRIAR | Novo use case |
| `worker-functions/src/interfaces/webhooks/controllers/TalentumWebhookController.ts` | MODIFICAR | Injetar novo use case |

### Fluxo

```
1. Recebe data: { _id, name } + environment
2. SELECT * FROM job_postings WHERE talentum_project_id = data._id
3. Se encontrou:
   → Log: "Job posting already exists for talentum_project_id={_id}, skipping"
   → Return { skipped: true, reason: 'already_exists', jobPostingId }
4. Se nao encontrou:
   → SELECT COALESCE(MAX(case_number), 0) + 1 FROM job_postings → nextCaseNumber
   → INSERT INTO job_postings:
       case_number = nextCaseNumber
       title = 'CASO {nextCaseNumber}'
       status = 'BUSQUEDA'
       country = 'AR'
       talentum_project_id = data._id
       talentum_published_at = NOW()
   → Return { created: true, jobPostingId, caseNumber }
```

### Regras de negocio

- **Titulo**: sempre `CASO {next_case_number}`, auto-gerado. `data.name` da Talentum e ignorado.
- **Status**: `BUSQUEDA` (vaga ativa, pronta para receber candidatos)
- **Country**: `AR` (default — todas as vagas Enlite sao Argentina por enquanto)
- **Anti-loop**: se `talentum_project_id` ja existe no banco, skip silencioso (idempotente)
- **Concorrencia**: o indice UNIQUE em `talentum_project_id` protege contra race conditions. Em caso de conflito, catch do `unique_violation` (23505) e tratar como skip.

### Campos NAO preenchidos na criacao via webhook

Estes campos ficam NULL e podem ser preenchidos depois manualmente pelo admin:

- `required_professions`, `required_sex`, `age_range_min/max`
- `required_experience`, `worker_attributes`
- `pathology_types`, `dependency_level`
- `schedule`, `work_schedule`
- `service_device_types`
- `salary_text`, `payment_day`
- `city`, `state`
- `daily_obs`, `providers_needed`
- `talentum_description` (a Talentum nao envia no CREATED, so o name)

### Criterios de aceite
- [ ] Dado `PRESCREENING.CREATED` com `_id` novo → cria job_posting com titulo `CASO {N}`
- [ ] Dado `PRESCREENING.CREATED` com `_id` que ja existe em `talentum_project_id` → skip sem erro
- [ ] `case_number` e sequencial (MAX+1)
- [ ] `status` da vaga criada e `BUSQUEDA`
- [ ] `talentum_project_id` e salvo corretamente
- [ ] Race condition (dois webhooks simultaneos) nao gera dupla — unique index protege
- [ ] Retorna resposta indicando se criou ou pulou

---

## Step 5 — QA: Testes E2E

**Status:** PENDENTE

### Objetivo
Validar o fluxo completo do webhook v2 com ambos os tipos de evento.

### Arquivo a criar

| Arquivo | Tipo |
|---------|------|
| `worker-functions/tests/e2e/talentum-webhook-v2.test.ts` | CRIAR |

### Cenarios

**PRESCREENING.CREATED:**

1. **Vaga nova** — `_id` que nao existe no banco → cria job_posting com titulo `CASO {N}`, status `BUSQUEDA`, `talentum_project_id` preenchido
2. **Vaga ja existe (anti-loop)** — `_id` que ja esta em `talentum_project_id` → retorna 200, nao cria dupla
3. **Payload invalido** — `action=PRESCREENING, subtype=ANALYZED` → retorna 400

**PRESCREENING_RESPONSE.*:**

4. **INITIATED** — cria worker (se nao existe) + talentum_prescreening + worker_job_application
5. **ANALYZED com QUALIFIED** — atualiza score, transiciona para QUALIFIED, emite domain event
6. **ANALYZED com NOT_QUALIFIED** — atualiza score, transiciona para NOT_QUALIFIED
7. **Idempotencia** — mesmo payload ANALYZED enviado 2x → sem duplicacao, sem erro

**Validacao de envelope:**

8. **Sem action** → 400
9. **Sem subtype** → 400
10. **action desconhecido** → 400

### Criterios de aceite
- [ ] Todos os 10 cenarios passam
- [ ] Testes usam rota real (`/api/webhooks-test/talentum/prescreening`) com `X-Partner-Key`
- [ ] Verificam estado do banco apos cada chamada (SELECT para confirmar criacao/atualizacao)
- [ ] Anti-loop verificado: webhook apos publish outbound nao cria dupla

---

## Arquivos-chave (referencia)

| Arquivo | Papel |
|---------|-------|
| `worker-functions/src/interfaces/webhooks/controllers/TalentumWebhookController.ts` | Controller ativo do webhook |
| `worker-functions/src/interfaces/webhooks/validators/talentumPrescreeningSchema.ts` | Zod schema (ponto principal de mudanca) |
| `worker-functions/src/application/usecases/ProcessTalentumPrescreening.ts` | Use case existente para PRESCREENING_RESPONSE |
| `worker-functions/src/application/use-cases/PublishVacancyToTalentumUseCase.ts` | Fluxo outbound (referencia para anti-loop) |
| `worker-functions/src/infrastructure/repositories/TalentumPrescreeningRepository.ts` | Upserts inbound com dedup |
| `worker-functions/migrations/106_add_talentum_outbound.sql` | Colunas `talentum_*` em job_postings |

---

## Diagrama de Dependencias

```
Step 1 (Zod schema envelope) ──→ Step 2 (Controller routing) ──→ Step 3 (Adaptar use case existente)
                                                                         |
                                                               Step 4 (Novo use case CREATED)
                                                                         |
                                                               Step 5 (QA / E2E)
```

Steps 3 e 4 podem ser implementados em paralelo apos Step 2.
