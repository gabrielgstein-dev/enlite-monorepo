# Roadmap: Testes de Integracacao Frontend → API → DB → UI

> Data: 2026-03-30
> Escopo: Mapear quais fluxos Playwright (enlite-frontend/e2e/) hoje usam `page.route()` para mockar a API e precisam ser convertidos em testes de integracacao reais que exercitam **Frontend → API → Postgres → Verificacao no Front** (alteracao de propriedade ou amostragem de dados).

---

## Definicao de "Teste de Integracacao Real"

```
 Playwright (browser)
   │
   ├─ Acao no UI (click, fill, submit)
   │       │
   │       ▼
   ├─ Chamada HTTP REAL ao backend (sem page.route mock)
   │       │
   │       ▼
   ├─ Backend processa → grava/le no Postgres (enlite_e2e)
   │       │
   │       ▼
   └─ UI reflete a mudanca (toast, lista atualizada, campo preenchido, badge novo)
         OU
       Query direta ao banco confirma a persistencia
```

O criterio e: **nenhum `page.route()` no caminho critico do fluxo** (mocks de auth/profile para permissao sao aceitaveis enquanto nao houver infra de seed completa).

---

## Diagnostico Atual: 13 arquivos E2E

| # | Arquivo | Nivel Atual | Mocks Criticos | Real Backend |
|---|---------|-------------|----------------|--------------|
| 1 | `worker-registration.e2e.ts` | **Parcial** | `/api/workers/init` interceptado (fetch-through em alguns tests) | Firebase Emulator real, alguns testes verificam DB |
| 2 | `admin-import-history.e2e.ts` | **Real** | Apenas `/api/admin/auth/profile` (permissao) | Upload real, SSE real, job processing real |
| 3 | `admin-uploads.e2e.ts` | **Mock pesado** | `/api/import/upload`, `/api/import/status/:id`, `/api/import/history`, `/api/import/queue` | Apenas auth (Firebase + Postgres seed) |
| 4 | `worker-profile-tabs.e2e.ts` | **Mock pesado** | `/api/workers/me` (GET), `/api/workers/me/general-info` (PUT), `/api/workers/me/service-area` (PUT) | Registro inicial real, depois mock |
| 5 | `documents-upload.e2e.ts` | **100% Mock** | Todos: `upload-url`, GCS PUT, `save`, `delete`, `view-url`, `documents` (GET) | Nenhum |
| 6 | `admin-workers.e2e.ts` | **100% Mock** | `/api/admin/workers`, `/api/admin/workers/stats` | Apenas auth |
| 7 | `vacancy-detail.e2e.ts` | **100% Mock** | `/api/admin/vacancies`, `/api/admin/vacancies/:id`, `/api/admin/vacancies/stats` | Apenas auth |
| 8 | `vacancy-match.e2e.ts` | **100% Mock** | `/api/admin/vacancies/:id/match` (POST), `/api/admin/vacancies/:id/match-results`, `/api/admin/messaging/whatsapp`, `/api/admin/messaging/templates` | Apenas auth |
| 9 | `logout.e2e.ts` | **Mock pesado** | `/api/workers/me`, `/api/workers/me/documents`, `/api/jobs`, `/api/admin/auth/profile` | Firebase Emulator real |
| 10 | `navegacao-fluida.e2e.ts` | **100% Mock** | Todos os endpoints admin | Apenas auth |
| 11 | `worker-profile-tab-nav.e2e.ts` | **100% Mock** | `/api/workers/me`, `/api/workers/me/documents` | Nenhum |
| 12 | `profile-completion-card.e2e.ts` | **100% Mock** | `/api/workers/me`, `/api/workers/me/documents` | Nenhum |
| 13 | `auth.setup.ts` | **Real** | Nenhum | Firebase real, `/register` real |

---

## Classificacao por Prioridade

### Prioridade Alta — Fluxos criticos de negocio que DEVEM ser integracacao real

Estes fluxos representam operacoes que alteram estado no banco e cujo resultado e visivel ao usuario. Se mockados, escondem bugs reais de contrato API/DB.

### Prioridade Media — Fluxos de leitura que beneficiam de dados reais

Estes fluxos leem dados existentes. Testar com dados seedados no banco garante que o contrato API ↔ Frontend nao divergiu.

### Prioridade Baixa — Fluxos puramente visuais / navegacao

Estes testes validam comportamento de UI (tabs, sidebar, responsividade). O mock e aceitavel e suficiente.

---

## Fase 1 — Infra Compartilhada (pre-requisito)

Antes de converter qualquer teste, precisamos de infra que permita ao Playwright rodar com backend + banco reais.

### 1.1 Docker Compose unificado para testes Playwright

Hoje o `docker-compose.test.yml` do worker-functions sobe `postgres + api`. Para testes Playwright, precisamos tambem do frontend.

**Deliverable:** `docker-compose.e2e-integration.yml` com:
- `postgres` (PostGIS 16, porta 5433, DB `enlite_e2e`)
- `api` (worker-functions com migrations automaticas, `USE_MOCK_AUTH=true`)
- `frontend` (Vite dev server apontando para `http://api:8080`)
- Network compartilhada

### 1.2 Seed factory para dados de teste

**Deliverable:** `enlite-frontend/e2e/seed/` com helpers que criam dados via API ou SQL direto:

```typescript
// seed/factories.ts
export async function seedWorker(overrides?: Partial<Worker>): Promise<Worker>
export async function seedAdmin(overrides?: Partial<Admin>): Promise<{ token: string; admin: Admin }>
export async function seedVacancy(adminToken: string, overrides?: Partial<Vacancy>): Promise<Vacancy>
export async function seedJobPosting(overrides?: Partial<JobPosting>): Promise<JobPosting>
export async function seedEncuadre(overrides?: Partial<Encuadre>): Promise<Encuadre>
export async function truncateAll(): Promise<void>
```

Estrategia: preferir seed via API (testa a criacao tambem) com fallback para SQL direto quando a API nao expoe a operacao.

### 1.3 Auth helper unificado

**Deliverable:** `enlite-frontend/e2e/helpers/auth.ts`

```typescript
// Cria usuario no Firebase Emulator + seeda no Postgres + retorna token
export async function createAuthenticatedWorker(page: Page): Promise<{ uid: string; email: string; token: string }>
export async function createAuthenticatedAdmin(page: Page): Promise<{ uid: string; email: string; token: string }>
```

Substitui os `seedAdminAndLogin()` duplicados em 5+ arquivos.

---

## Fase 2 — Fluxos de Escrita (Prioridade Alta)

Cada item abaixo descreve: o que mocka hoje, o que o teste de integracao deve verificar, e as dependencias.

### 2.1 Worker Registration → Init → Profile (worker-registration.e2e.ts)

| Aspecto | Hoje | Alvo |
|---------|------|------|
| `/register` (Firebase) | Real | Real |
| `POST /api/workers/init` | Interceptado (fetch-through) | Real, sem intercept |
| Verificacao DB | Parcial (alguns testes) | Obrigatoria: query `workers` por `auth_uid` |
| Verificacao UI | URL muda para `/` | URL muda + Home mostra dados do worker recem-criado |

**Teste de integracao:**
1. Preencher formulario de registro
2. Submit → Firebase cria usuario → Frontend chama `/api/workers/init`
3. Assert: `SELECT * FROM workers WHERE auth_uid = :uid` retorna registro
4. Assert: Home page mostra nome/email do worker (GET `/api/workers/me` real)

**Dependencia:** Seed factory para cleanup (`truncateAll` no afterEach)

---

### 2.2 Worker Profile — Informacao Geral (worker-profile-tabs.e2e.ts, Aba 1)

| Aspecto | Hoje | Alvo |
|---------|------|------|
| `GET /api/workers/me` | Mock retorna worker vazio | Real (worker criado no seed) |
| `PUT /api/workers/me/general-info` | Mock captura payload | Real |
| Verificacao DB | Nenhuma | Query `workers` confirma campos salvos |
| Verificacao UI | Toast "guardada con exito" | Toast + recarregar pagina e confirmar campos preenchidos |

**Teste de integracao:**
1. Seed: criar worker via registro real
2. Navegar para `/worker/profile`
3. Preencher Aba 1 (nome, sobrenome, profissao, documento, data nascimento)
4. Submit
5. Assert: toast de sucesso
6. Assert: `SELECT first_name, last_name, profession FROM workers WHERE auth_uid = :uid`
7. Assert: recarregar pagina → campos mostram valores salvos (round-trip completo)

---

### 2.3 Worker Profile — Area de Atendimento (worker-profile-tabs.e2e.ts, Aba 2)

| Aspecto | Hoje | Alvo |
|---------|------|------|
| `PUT /api/workers/me/service-area` | Mock | Real |
| Verificacao DB | Nenhuma | Query `worker_service_areas` |
| Verificacao UI | Toast | Toast + reload mostra area salva |

**Teste de integracao:**
1. Seed: worker com Aba 1 completa
2. Navegar para Aba 2
3. Preencher endereco + raio
4. Submit
5. Assert: `SELECT * FROM worker_service_areas WHERE worker_id = :id`
6. Assert: reload mostra dados persistidos

---

### 2.4 Worker Profile — Disponibilidade (worker-profile-tabs.e2e.ts, Aba 3)

| Aspecto | Hoje | Alvo |
|---------|------|------|
| `PUT /api/workers/me/availability` | Mock (implicitamente) | Real |
| Verificacao DB | Nenhuma | Query `worker_availability` |
| Verificacao UI | Toast | Toast + reload mostra disponibilidade |

---

### 2.5 Worker Documents — Upload Real (documents-upload.e2e.ts)

| Aspecto | Hoje | Alvo |
|---------|------|------|
| `POST /api/workers/me/documents/upload-url` | Mock | Real (retorna signed URL) |
| `PUT` GCS | Mock | **Manter mock** (nao queremos upload real ao GCS em teste) |
| `POST /api/workers/me/documents/save` | Mock | Real |
| `GET /api/workers/me/documents` | Mock | Real |
| `DELETE /api/workers/me/documents/:type` | Mock | Real |

**Nota:** O upload ao GCS continua mockado (nao e viavel subir arquivo real em teste). O teste de integracao cobre o ciclo: pedir URL → salvar path no banco → listar documentos → deletar.

**Teste de integracao:**
1. Seed: worker registrado
2. `POST /api/workers/me/documents/upload-url` → recebe signed URL (real)
3. Mock apenas o PUT ao GCS (simula upload ok)
4. `POST /api/workers/me/documents/save` → salva no banco (real)
5. Assert: `GET /api/workers/me/documents` retorna documento salvo
6. Assert: UI mostra documento com borda azul
7. `DELETE /api/workers/me/documents/resume_cv` → remove do banco (real)
8. Assert: reload mostra card vazio

---

### 2.6 Admin Upload + Import Pipeline (admin-uploads.e2e.ts)

| Aspecto | Hoje | Alvo |
|---------|------|------|
| `POST /api/import/upload` | Mock | Real |
| `GET /api/import/status/:id` | Mock (polling) | Real (polling ou SSE) |
| `GET /api/import/history` | Mock | Real |
| `GET /api/import/queue` | Mock | Real |

**Nota:** `admin-import-history.e2e.ts` ja faz isso parcialmente. A conversao de `admin-uploads.e2e.ts` pode reaproveitar a mesma infra.

**Teste de integracao:**
1. Seed: admin autenticado
2. Upload arquivo CSV de Talent Search (real)
3. Polling `/api/import/status/:id` ate `completed`
4. Assert: `/api/import/history` inclui o job
5. Assert: `SELECT COUNT(*) FROM workers WHERE source = 'talentum'` > 0
6. Assert: UI mostra zona em estado "done" + historico atualizado

---

### 2.7 Vacancy Match — Rodar + Enviar WhatsApp (vacancy-match.e2e.ts)

| Aspecto | Hoje | Alvo |
|---------|------|------|
| `POST /api/admin/vacancies/:id/match` | Mock | Real (requer workers + vacancy seedados) |
| `GET /api/admin/vacancies/:id/match-results` | Mock | Real |
| `POST /api/admin/messaging/whatsapp` | Mock | Real (Twilio em sandbox/mock mode) |

**Dependencia pesada:** Requer seed completo (vacancy com `llm_enriched_at`, workers com `service_area`, `availability`, `profession`). Este e o fluxo mais complexo.

**Teste de integracao:**
1. Seed: admin + vacancy com dados LLM + 3 workers com perfis compativeis
2. Navegar para `/admin/vacancies/:id/match`
3. Clicar "Rodar Match"
4. Assert: lista de candidatos aparece com scores reais
5. Assert: `SELECT * FROM worker_job_applications WHERE job_posting_id = :id`
6. Selecionar worker → Enviar WhatsApp
7. Assert: `SELECT * FROM messaging_outbox WHERE worker_id = :wid` tem registro
8. Assert: badge "Notificado" aparece na UI

**Nota sobre Twilio:** Em ambiente de teste, o OutboxProcessor pode rodar com `TWILIO_ENABLED=false`, gravando no outbox sem enviar. O teste valida que o registro foi criado.

---

## Fase 3 — Fluxos de Leitura (Prioridade Media)

### 3.1 Admin Workers — Lista + Stats (admin-workers.e2e.ts)

| Aspecto | Hoje | Alvo |
|---------|------|------|
| `GET /api/admin/workers` | Mock com 2 workers fixos | Real (workers seedados no DB) |
| `GET /api/admin/workers/stats` | Mock | Real |
| Filtros | Mock verifica query params | Real: filtro retorna subset correto |

**Teste de integracao:**
1. Seed: 5 workers (2 talentum, 2 planilla, 1 ana_care) com datas variadas
2. Navegar para `/admin/workers`
3. Assert: tabela mostra 5 workers
4. Assert: stats cards mostram contagens corretas (hoje, ontem, 7 dias)
5. Filtrar por plataforma "talentum"
6. Assert: tabela mostra apenas 2 workers

---

### 3.2 Vacancy Detail (vacancy-detail.e2e.ts)

| Aspecto | Hoje | Alvo |
|---------|------|------|
| `GET /api/admin/vacancies` (lista) | Mock | Real |
| `GET /api/admin/vacancies/:id` (detalhe) | Mock | Real |

**Teste de integracao:**
1. Seed: 2 vacancies (uma com LLM, uma sem)
2. Navegar para `/admin/vacancies`
3. Clicar na primeira linha
4. Assert: detalhe mostra case_number, status, badge LLM
5. Assert: botao "Ver Match" navega corretamente

---

### 3.3 Logout com Dados Reais (logout.e2e.ts)

| Aspecto | Hoje | Alvo |
|---------|------|------|
| `GET /api/workers/me` | Mock | Real (worker seedado) |
| `GET /api/jobs` | Mock | Real |

**Teste de integracao:**
1. Seed: worker com dados reais
2. Login → home carrega dados reais do worker
3. Clicar logout
4. Assert: redireciona para `/login`
5. Assert: acessar `/` redireciona para `/login` (sem auth)

---

## Fase 4 — Puramente Visuais (Prioridade Baixa — Manter Mock)

Estes testes validam comportamento de UI/CSS que nao depende de dados reais. **O mock e aceitavel e recomendado** para manter velocidade e determinismo.

| Arquivo | Justificativa para manter mock |
|---------|-------------------------------|
| `navegacao-fluida.e2e.ts` | Testa sidebar, animacoes CSS, rotas. Qualquer JSON de resposta serve. |
| `worker-profile-tab-nav.e2e.ts` | Testa navegacao entre abas (carousel, botoes). Nao depende de dados reais. |
| `profile-completion-card.e2e.ts` | Testa renderizacao de card com 0%. Dados mockados sao mais determinisicos. |

---

## Resumo de Esforco

| Fase | Itens | Complexidade | Dependencia |
|------|-------|-------------|-------------|
| **Fase 1 — Infra** | Docker compose, seed factory, auth helper | Media | Nenhuma |
| **Fase 2.1** — Worker Registration | 1 arquivo | Baixa | Fase 1 |
| **Fase 2.2-2.4** — Worker Profile (3 abas) | 1 arquivo, 3 fluxos | Media | Fase 1 + 2.1 |
| **Fase 2.5** — Documents Upload | 1 arquivo | Media | Fase 1 + 2.1 |
| **Fase 2.6** — Admin Upload Pipeline | 1 arquivo | Media | Fase 1 (ja tem referencia em admin-import-history) |
| **Fase 2.7** — Vacancy Match + WhatsApp | 1 arquivo | **Alta** | Fase 1 + seed complexo (vacancy + workers + LLM) |
| **Fase 3.1** — Admin Workers Lista | 1 arquivo | Baixa | Fase 1 |
| **Fase 3.2** — Vacancy Detail | 1 arquivo | Baixa | Fase 1 + seed vacancy |
| **Fase 3.3** — Logout real | 1 arquivo | Baixa | Fase 1 |
| **Fase 4** — Visuais | 3 arquivos | N/A | Manter como esta |

---

## Riscos e Mitigacoes

| Risco | Mitigacao |
|-------|----------|
| Testes de integracao sao mais lentos | Manter suite mockada separada (`tag: @mock`) para CI rapido; suite de integracao roda em CI noturno ou pre-merge |
| Flakiness por estado residual no banco | `truncateAll()` no `beforeEach` de cada suite + transactions isoladas |
| GCS upload nao e viavel em teste | Manter mock para PUT ao GCS; testar apenas o ciclo upload-url → save → list |
| Twilio nao e viavel em teste | `TWILIO_ENABLED=false` + verificar `messaging_outbox` no banco |
| Seed de dados complexo para match | Criar fixtures SQL determinisicas em `e2e/seed/fixtures.sql` |
| Frontend e backend em versoes incompativeis | Docker compose usa imagem local (build do branch atual) |

---

## Metricas de Sucesso

- [ ] **Fase 1:** `docker compose -f docker-compose.e2e-integration.yml up` sobe frontend + api + postgres com migrations em < 60s
- [ ] **Fase 2:** 7 fluxos de escrita passam sem nenhum `page.route()` no caminho critico
- [ ] **Fase 3:** 3 fluxos de leitura passam com dados seedados reais
- [ ] **Cobertura de contrato:** Todo endpoint usado pelo frontend tem pelo menos 1 teste de integracao real
- [ ] **CI:** Suite de integracao roda em < 5 min no GitHub Actions
