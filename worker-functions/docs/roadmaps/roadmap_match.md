# Roadmap: Tela de Match de Vacantes (Frontend + Backend)

## Visão Geral

Feature completa para visualização, matching e envio de mensagens a partir das vacantes.
Inclui tela de detalhe da vaga, tela de match com resultados salvos, e envio de WhatsApp
(individual ou em lote) para os candidatos rankeados.

### Fluxo do usuário

```
Lista de Vacantes (/admin/vacancies)
  └─ Clica em uma vaga
       └─ Detalhe da Vaga (/admin/vacancies/:id)
            └─ Clica "Ver Match"
                 └─ Tela de Match (/admin/vacancies/:id/match)
                      ├─ Carrega resultados salvos (GET /match-results)
                      ├─ Botão "Rodar Match" → POST /match → atualiza lista
                      └─ Seleção + Enviar WhatsApp (individual ou em lote)
```

### As 3 fases do match (já implementadas no backend)

```
Fase 1 — Hard Filter (SQL)
  Workers ativos, sem blacklist, com ocupação compatível,
  dentro do raio geográfico (opcional), sem casos ativos (opcional)

Fase 2 — Structured Scoring (0–100, in-memory)
  Ocupação (0–40) + Proximidade geográfica (0–35) + Diagnósticos (0–25)

Fase 3 — LLM Scoring (0–100, Groq API, top N candidatos)
  Avalia perfil completo vs. vaga. Retorna score, razão, strengths, red flags.

Score final = structuredScore * 0.35 + llmScore * 0.65
```

---

## Estado atual

| Componente | Estado |
|---|---|
| `GET /api/admin/vacancies/:id` | ✅ Implementado — retorna dados completos da vaga + encuadres + publicações |
| `POST /api/admin/vacancies/:id/match` | ✅ Implementado — roda as 3 fases, salva em `worker_job_applications`, retorna `MatchResult` |
| `POST /api/admin/vacancies/:id/enrich` | ✅ Implementado — re-parseia campos LLM da vaga |
| `POST /api/admin/messaging/whatsapp` | ✅ Implementado — aceita `jobPostingId` opcional; atualiza `messaged_at` ao enviar `vacancy_match` |
| `GET /api/admin/messaging/templates` | ✅ Implementado — lista templates ativos |
| Template `vacancy_match` | ✅ Seeded — `{{name}}`, `{{role}}`, `{{location}}` |
| `GET /api/admin/vacancies/:id/match-results` | ✅ Implementado — retorna candidatos de `worker_job_applications` com KMS decrypt + distância PostGIS |
| `messaged_at` em `worker_job_applications` | ✅ Migration 061 criada |
| `src/types/match.ts` | ✅ Criado — `SavedCandidate`, `MatchResultsResponse`, `MatchResult`, `MessageTemplate`, `WhatsAppSentResult` |
| `AdminApiService` — métodos de match/messaging | ✅ Adicionados — `getMatchResults`, `triggerMatch`, `sendWhatsApp`, `getMessageTemplates` |
| Rotas `/admin/vacancies/:id` e `/:id/match` | ✅ Registradas em `App.tsx` com lazy-load |
| `useVacancyDetail` | ✅ Criado — carrega `GET /vacancies/:id` |
| `useVacancyMatch` | ✅ Criado — carrega resultados salvos + `runMatch()` + `markMessaged()` |
| `useMatchMessaging` | ✅ Criado — `sendBatch()` sequencial 300ms + progress por worker |
| `VacancyDetailPage` (frontend) | ✅ Implementado — **Fase 3** |
| `VacancyMatchPage` (frontend) | ✅ Implementado — **Fase 4** |
| `SendMessageModal` (frontend) | ✅ Implementado — **Fase 5** — seleção de template, preview com variáveis reais, confirmação re-envio, "Só novos" vs "Re-enviar todos" |

---

## Fases de Implementação

### Fase 1 — Backend: endpoint GET /match-results ✅ Concluído

**Arquivo:** `src/interfaces/controllers/VacanciesController.ts`

Sem esse endpoint, a tela de match precisa re-rodar o LLM toda vez que abre,
o que é lento e caro. O endpoint consulta os resultados já salvos em
`worker_job_applications` sem disparar novo processamento.

**Novo endpoint:**

```
GET /api/admin/vacancies/:id/match-results
Query params: limit (default 50), offset (default 0)
```

**Query:** `worker_job_applications` JOIN `workers` WHERE `job_posting_id = :id`
ORDER BY `match_score DESC`

**Response shape:**

```typescript
{
  success: true,
  data: {
    jobPostingId: string;
    lastMatchAt: string | null;         // MAX(wja.created_at) ou updated_at
    totalCandidates: number;
    candidates: SavedCandidate[];
  }
}

interface SavedCandidate {
  workerId: string;
  workerName: string;                   // descriptografado via KMS (já feito no match)
  workerPhone: string;
  occupation: string | null;
  workZone: string | null;
  distanceKm: number | null;
  activeCasesCount: number;
  overallStatus: string | null;
  matchScore: number;                   // == finalScore do MatchResult
  internalNotes: string | null;         // llmReasoning salvo aqui
  applicationStatus: string;            // applied | under_review | shortlisted | etc.
  alreadyApplied: boolean;
  messagedAt: string | null;            // ver Fase 1b abaixo
}
```

**Rota registrada** em `src/index.ts` (as demais rotas de vacancies também estão em `index.ts`).

**Decisões de implementação:**
- Descriptografia KMS feita em `Promise.all` por candidato (mesma estratégia do `MatchmakingService`)
- Distância calculada inline com `ST_Distance(wl.location, jp.service_location)` — evita round-trip extra
- `alreadyApplied = application_status === 'applied'` distingue candidatos orgânicos dos adicionados pelo match (`under_review`)

---

#### Fase 1b — Melhoria: campo `messaged_at` em `worker_job_applications` ✅ Concluído

**Problema identificado:** sem esse campo, não há como saber quais workers já receberam
WhatsApp para essa vaga. Isso causa risco de mensagem duplicada ao rodar "Enviar para todos"
mais de uma vez.

**Migration criada** (`migrations/061_add_messaged_at_to_worker_job_applications.sql`):

```sql
ALTER TABLE worker_job_applications
  ADD COLUMN messaged_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN worker_job_applications.messaged_at IS
  'Última vez que enviamos WhatsApp vacancy_match para este worker nesta vaga.
   NULL = nunca enviado. Atualizado pelo MessagingController ou por batch send.';
```

**No controller de messaging:** ✅ Implementado. `sendToWorker` aceita `jobPostingId` opcional no body.
Após envio bem-sucedido com `templateSlug === 'vacancy_match'`, executa `UPDATE worker_job_applications SET messaged_at = NOW()`.
Falha silenciosa (warn + continua) para não bloquear a resposta ao cliente.

**No frontend:** candidatos com `messagedAt != null` recebem badge "Já notificado" e
botão de envio desabilitado por padrão (com opção de re-enviar explicitamente).

---

### Fase 2 — Frontend: rotas, tipos e API service ✅ Concluído

**Arquivos a modificar/criar:**

#### 2a. Registrar rotas em `src/presentation/App.tsx` ✅

Ambas as páginas são lazy-loaded e envolvidas em `AdminProtectedRoute` + `AdminLayout`, seguindo o padrão das outras rotas admin.

#### 2b. Adicionar métodos em `src/infrastructure/http/AdminApiService.ts` ✅

`sendWhatsApp` recebe `jobPostingId?: string` extra (além do especificado no roadmap) para que o backend possa rastrear `messaged_at`.

#### 2c. Criar tipos em `src/types/match.ts` ✅

Criado com: `SavedCandidate`, `MatchResultsResponse`, `MatchResult`, `ScoredCandidate`, `MessageTemplate`, `WhatsAppSentResult`.
Imports nos hooks e no `AdminApiService` usam caminho relativo (`../../types/match`) — o alias `@/` não está configurado no projeto.

#### 2d. Criar hooks ✅

- `useVacancyDetail` — carrega `GET /vacancies/:id`, expõe `refetch()`
- `useVacancyMatch` — carrega resultados salvos no mount; `runMatch()` dispara POST e converte `ScoredCandidate → SavedCandidate` preservando `messagedAt` anteriores; `markMessaged()` atualiza state local sem re-fetch
- `useMatchMessaging` — `sendBatch()` loop sequencial 300ms, `progress[]` por worker com estados `pending | sending | sent | error`; `sendToOne()` para envio individual

---

### Fase 3 — Frontend: VacancyDetailPage ✅ Concluído

**Arquivo:** `src/presentation/pages/admin/VacancyDetailPage.tsx`

**Layout:**

```
[← Voltar]  Caso 1234 — Nome do Paciente         [Rodar Match →]
────────────────────────────────────────────────────────────────
[ Card: Status da Vaga ]      [ Card: Paciente ]
  Status badge (BUSQUEDA)       Diagnóstico
  País                          Nível de dependência
  Início da busca               Zona / bairro
  Providers needed / vagas      Plano de saúde verificado

[ Card: Requisitos (LLM) ]    [ Card: Horário (LLM) ]
  Sexo requerido                Dias + turnos parseados
  Profissões                    Interpretação
  Especialidades
  Diagnósticos requeridos
  Chip: "LLM" badge + data enriquecimento

[ Card: Encuadres recentes ]
  Tabela: worker, data, resultado, presente

[ Card: Publicações ]
  Canal, data, recrutador
```

**Componentes criados em** `src/presentation/components/features/admin/VacancyDetail/`:

- `VacancyStatusCard.tsx` ✅
- `VacancyPatientCard.tsx` ✅
- `VacancyRequirementsCard.tsx` ✅ — badge "LLM parseado em DD/MM/YYYY"
- `VacancyScheduleCard.tsx` ✅
- `VacancyEncuadresCard.tsx` ✅

**UX implementado:**
- Badge de status colorido (azul=BUSQUEDA, amarelo=REEMPLAZOS, verde=ACTIVO, cinza=CERRADO)
- Chip "LLM parseado em DD/MM/YYYY" no header dos cards de Requisitos e Horário
- Botão "Ver Match →" navega para `/admin/vacancies/:id/match`
- Botão ícone Sparkles chama `POST /enrich` + refetch (falha silenciosa)
- Card de Publicações inline na página (não necessitou componente separado)
- `AdminApiService.enrichVacancy()` adicionado

**Decisões de implementação:**
- Cards usam `border border-slate-200 shadow-sm` (padrão AdminRecruitmentPage)
- Padding responsivo `px-4 sm:px-8 lg:px-[120px]` alinhado com AdminRecruitmentPage

---

### Fase 4 — Frontend: VacancyMatchPage ✅ Concluído

**Arquivo:** `src/presentation/pages/admin/VacancyMatchPage.tsx`

**Layout:**

```
[← Vaga]  Match — Caso 1234        [Rodar Match Novamente]  [Enviar para N selecionados]
─────────────────────────────────────────────────────────────────────────────────────────
Último match: DD/MM/YYYY HH:mm  |  N candidatos  |  [ Filtro score mínimo ]

┌──────────────────────────────────────────────────────────────────────────────────────┐
│ ☐ │ # │ Nome          │ Status       │ Ocupação │ Zona / Dist │ Casos │ Score Final │ ··· │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ ☐ │ 1 │ Maria S.      │ QUALIFICADO  │ Cuidadora│ Palermo 2km │   0   │ ████ 87     │ ··· │
│ ☐ │ 2 │ Ana R.        │ PRÉ-TALENTUM │ AT       │ Caballito 4km│  1  │ ███  74     │ ··· │
│   │   │ ↳ "Perfil compatível com TEA. Sem experiência em dependência grave."         │     │
│   │   │   Strengths: [TEA] [mobilidade]   Red flags: [dependência grave]             │     │
└──────────────────────────────────────────────────────────────────────────────────────┘

[Barra fixa no rodapé quando há selecionados]
  ☑ 3 workers selecionados    [ Enviar WhatsApp ]   [ Limpar seleção ]
```

**Componentes criados em** `src/presentation/components/features/admin/VacancyMatch/`:

- `MatchCandidateRow.tsx` ✅ — linha expansível, badges, score bar, botão WhatsApp individual
- `MatchScoreBar.tsx` ✅ — barra colorida, tooltip "Estruturado: X · LLM: Y" ao hover
- `MatchSummaryBar.tsx` ✅ — contador + timestamp + input de score mínimo
- `MatchSelectionFooter.tsx` ✅ — barra fixa no rodapé, some quando `selectedCount === 0`

**UX implementado:**
- Estado inicial: lista vazia + botão "Rodar Match" primary/prominente
- Após rodar: botão muda para "Rodar Novamente" (outline, menos destaque)
- "Selecionar todos" seleciona apenas os candidatos filtrados visíveis
- Filtro de score mínimo (input numérico) filtra sem re-fetch
- Chip azul "Já candidatou" para `alreadyApplied = true`
- Badge âmbar "Notificado DD/MM" para `messagedAt != null`
- `SimpleSendModal` inline: confirma envio, mostra progresso por worker (pending/sending/sent/error)

**Pendente na Fase 5:**
- Confirmação antes de re-enviar para worker já notificado
- Seleção de template (dropdown + preview)
- Extração do `SimpleSendModal` para `SendMessageModal.tsx` dedicado

**Decisões de implementação:**
- Cards/tabela usam `border border-slate-200 shadow-sm` (padrão AdminRecruitmentPage)
- Padding responsivo `px-4 sm:px-8 lg:px-[120px]`
- `pb-24` para não sobrepor a barra de seleção fixa

---

### Fase 5 — Frontend: SendMessageModal ✅ Concluído

**Arquivo:** `src/presentation/components/features/admin/VacancyMatch/SendMessageModal.tsx`

**Comportamento:**
- Abre ao clicar "Enviar WhatsApp" (individual ou em lote)
- Exibe: template selecionado, preview da mensagem com variáveis reais preenchidas
- Variáveis do template `vacancy_match`:
  - `name` → `candidate.workerName`
  - `role` → `vacancy.llm_required_profession[0]` ou `vacancy.title`
  - `location` → `vacancy.patient_zone` ou `vacancy.title`
- Permite trocar o template (dropdown com `GET /templates`)
- Confirm → loop de envios sequenciais com feedback por worker:

```
Enviando...
  ✓ Maria S.       — enviado
  ✓ Ana R.         — enviado
  ✗ João P.        — erro: sem telefone cadastrado
  ✓ Paula M.       — enviado
Concluído: 3 enviados, 1 falhou
```

- Após envio: atualiza `messagedAt` na lista local sem re-fetch (sobrescreve a data anterior)

**Estratégia de envio em lote:**
- Loop no frontend, chamando `POST /messaging/whatsapp` para cada worker sequencialmente
- Não paralelo — evita rate limiting do Twilio
- Intervalo de 300ms entre chamadas

---

### Fase 6 — E2E tests ✅ Concluído

Seguindo o padrão do projeto (`/e2e-create` → `/e2e-run`):

**Backend** — `tests/e2e/match-results.test.ts`

```
✓ GET /match-results — retorna candidatos salvos em worker_job_applications
✓ GET /match-results — vaga sem matches → array vazio
✓ GET /match-results — paginação: limit + offset funcionam
✓ GET /match-results — candidatos ordenados por match_score DESC
✓ GET /match-results — inclui workerName, workerPhone, occupation, workZone
✓ POST /match — salva resultados e GET /match-results reflete os novos dados
✓ messaged_at — começa NULL, atualiza após envio de WhatsApp
```

**Frontend** — Playwright: `tests/e2e/vacancy-detail.spec.ts`

```
✓ Navega de /admin/vacancies para detalhe ao clicar na linha
✓ Exibe case number, status, dados do paciente
✓ Campos LLM exibem badge "LLM parseado" quando enriquecidos
✓ Botão "Ver Match" navega para /admin/vacancies/:id/match
```

**Frontend** — Playwright: `tests/e2e/vacancy-match.spec.ts`

```
✓ Página carrega com estado vazio quando não há matches salvos
✓ Botão "Rodar Match" dispara POST /match e lista aparece
✓ Score bar reflete finalScore do candidato
✓ LLM reasoning expande/colapsa ao clicar na linha
✓ Checkbox seleciona linha; barra de rodapé aparece
✓ "Selecionar todos" seleciona apenas workers visíveis
✓ Filtro de score filtra a lista sem re-fetch
✓ "Enviar WhatsApp" individual abre modal com nome preenchido
✓ Modal envia e exibe status por worker
✓ Badge "Já notificado DD/MM" aparece após envio bem-sucedido
✓ Re-envio individual: clicar novamente abre modal de confirmação, não bloqueia
✓ Re-envio em lote: se algum worker já foi notificado, modal avisa quantos serão re-enviados
```

---

## Ordem de execução

```
✅ 1. Fase 1  → Backend: GET /match-results + migration messaged_at
✅ 2. Fase 2  → Frontend: rotas + types + AdminApiService + hooks
✅ 3. Fase 3  → Frontend: VacancyDetailPage + sub-componentes
✅ 4. Fase 4  → Frontend: VacancyMatchPage + sub-componentes
✅ 5. Fase 5  → Frontend: SendMessageModal dedicado + confirmação re-envio + seleção de template
✅ 6. Fase 6  → E2E tests: match-results.test.ts + vacancy-detail.e2e.ts + vacancy-match.e2e.ts
```

---

## Arquivos do módulo (mapa completo)

```
worker-functions/
  src/interfaces/controllers/
    VacanciesController.ts              ✅  getMatchResults() adicionado
  src/interfaces/routes/
    vacanciesRoutes.ts                  —   não existe; rotas em src/index.ts
  src/index.ts                          ✅  GET /:id/match-results registrado
  src/interfaces/controllers/
    MessagingController.ts              ✅  sendToWorker atualiza messaged_at
  migrations/
    061_add_messaged_at_wja.sql         ✅  criada (Fase 1b)

enlite-frontend/
  src/presentation/pages/admin/
    VacancyDetailPage.tsx               ✅  criado (Fase 3)
    VacancyMatchPage.tsx                ✅  criado (Fase 4)
  src/presentation/components/features/admin/
    VacancyDetail/
      VacancyStatusCard.tsx             ✅  criado (Fase 3)
      VacancyPatientCard.tsx            ✅  criado (Fase 3)
      VacancyRequirementsCard.tsx       ✅  criado (Fase 3)
      VacancyScheduleCard.tsx           ✅  criado (Fase 3)
      VacancyEncuadresCard.tsx          ✅  criado (Fase 3)
    VacancyMatch/
      MatchCandidateRow.tsx             ✅  criado (Fase 4)
      MatchScoreBar.tsx                 ✅  criado (Fase 4)
      MatchSummaryBar.tsx               ✅  criado (Fase 4)
      MatchSelectionFooter.tsx          ✅  criado (Fase 4)
      SendMessageModal.tsx              ✅  criado (Fase 5)
  src/hooks/admin/
    useVacancyDetail.ts                 ✅  criado (Fase 2d)
    useVacancyMatch.ts                  ✅  criado (Fase 2d)
    useMatchMessaging.ts                ✅  criado (Fase 2d)
  src/infrastructure/http/
    AdminApiService.ts                  ✅  4 métodos adicionados (Fase 2b)
  src/types/
    match.ts                            ✅  criado (Fase 2c)
  src/presentation/App.tsx              ✅  2 rotas registradas (Fase 2a)
  tests/e2e/
    match-results.test.ts               ✅  criado (Fase 6 — backend Jest)
    vacancy-detail.e2e.ts               ✅  criado (Fase 6 — Playwright)
    vacancy-match.e2e.ts                ✅  criado (Fase 6 — Playwright)
```

---

## Decisões de design

### Por que GET /match-results e não re-rodar sempre?
O match com LLM (Fase 3) chama Groq API para os top-N candidatos — é lento e tem custo.
Salvar em `worker_job_applications` permite recarregar instantaneamente. O admin decide
quando re-rodar explicitamente.

### Por que messaged_at em worker_job_applications?
Rastreia histórico de contato, mas **não bloqueia re-envio**. O admin sempre pode
reenviar — o campo serve para exibir o badge "Já notificado DD/MM" e disparar uma
confirmação antes de re-enviar, evitando envio acidental sem impedir o intencional.

### Por que envio sequencial (não paralelo)?
Twilio tem rate limits. Envio paralelo para 20 workers simultâneos pode causar erros
429. Com intervalo de 300ms, 20 envios completam em ~6s — aceitável para admin.

### Por que variáveis do template preenchidas no frontend?
O controller de messaging já aceita `variables` no payload. O frontend preenche
`name`, `role`, `location` a partir dos dados do candidato + da vaga já carregados
na tela. Não há round-trip extra ao servidor para montar o preview.
