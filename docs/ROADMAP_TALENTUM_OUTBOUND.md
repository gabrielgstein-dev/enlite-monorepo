# Roadmap — Publicacao Automatica de Vagas na Talentum

> Admin cria vagas no painel Enlite em pagina multi-step com todos os campos estruturados, configura perguntas de prescreening, revisa a descricao gerada pelo Groq (Llama 3.3 70B) a partir dos campos preenchidos, e publica diretamente na Talentum.chat.

---

## Status Geral

| Step | Escopo | Status |
|------|--------|--------|
| **Step 1** | Backend: TalentumApiClient (servico encapsulado) | DONE |
| **Step 2** | Backend: Migration Talentum (colunas + tabelas prescreening) | DONE |
| **Step 3** | Backend: TalentumDescriptionService (Groq gera texto a partir de campos estruturados) | DONE |
| **Step 4** | Backend: PublishVacancyToTalentum use case + endpoints | DONE |
| **Step 5** | Backend: Migration campos completos da vaga + split controller | DONE |
| **Step 6** | Frontend: Pagina multi-step /admin/vacancies/new (dados + prescreening + revisao + publicacao) | DONE |
| **Step 7** | Frontend: Tela de detalhe /admin/vacancies/:id (visualizacao + edicao inline) | DONE |
| **Step 8** | QA: Validacao completa | PENDENTE |

---

## Contexto

### Fluxo manual anterior (recrutadoras)
```
1. Coordenadora passa dados do caso
2. Recrutadora cola no GEM (Google Gemini) com template
3. GEM gera texto formatado (Secao A + B + C)
4. Recrutadora copia Secao B para planilha
5. Corrige manualmente se necessario
6. Importa no WordPress e cria prescreening manualmente na Talentum
```

### Fluxo automatizado (implementado)
```
1. Admin acessa /admin/vacancies/new
2. Step 1: Preenche TODOS os campos estruturados da vaga (20 campos em 5 secoes)
3. Step 2: Configura perguntas de prescreening + FAQ
4. Step 3: Sistema cria vacante, salva prescreening, gera descricao via Groq
   → Admin revisa dados + perguntas + descricao gerada
5. Admin clica "Aceptar y enviar a Talentum"
   → Backend publica na Talentum API → salva whatsappUrl
   → Redireciona para /admin/vacancies/:id (tela de detalhe)
6. Admin compartilha link do bot WhatsApp com candidatos
7. Candidato faz prescreening via WhatsApp (Talentum)
8. Talentum envia resultados via webhook → fluxo existente (ProcessTalentumPrescreening)
```

### Decisoes de produto

1. **Todos os campos do CSV WordPress estao em `job_postings`** — sem JOIN com patients.
2. **`required_professions` e array** (TEXT[]) — AT, CAREGIVER, NURSE, KINESIOLOGIST, PSYCHOLOGIST.
3. **Faixa etaria usa dois campos numericos** (`age_range_min`, `age_range_max`).
4. **Salario e texto livre** (`salary_text`) — default "A convenir". Colunas decimais removidas.
5. **`schedule` e JSONB estruturado** — alinhado com `worker_availability` para matching.
6. **`service_device_types` e array** (TEXT[]) — 8 valores possiveis.
7. **`required_sex` e campo manual** — M, F ou BOTH.
8. **`worker_profile_sought` removido do formulario** — o Groq usa TODOS os campos estruturados como input. Coluna sera dropada em migration futura.
9. **Criacao via pagina multi-step** (nao modal) — Steps: dados → prescreening → revisao + publicacao.
10. **Tela de detalhe e somente visualizacao** — edicao via modal se necessario.

### Documentacao de referencia
- API Talentum: `docs/features/TALENTUM_OUTBOUND_API.md`
- Gestao de vagas: `docs/features/vacancy-management.md`
- Webhooks inbound: `docs/features/webhooks-integrations.md`

---

## Step 1 — Backend: TalentumApiClient (DONE)

**Arquivo:** `worker-functions/src/infrastructure/services/TalentumApiClient.ts`

Client reutilizavel que encapsula login RSA-OAEP + CRUD de prescreenings na API Talentum. Factory: `TalentumApiClient.create()` (tenta env vars, fallback GCP Secret Manager).

Metodos: `createPrescreening()`, `getPrescreening()`, `deletePrescreening()`, `listPrescreenings()`.

---

## Step 2 — Backend: Migration Talentum (DONE)

**Migration:** `worker-functions/migrations/106_add_talentum_outbound.sql`

Colunas em `job_postings`: `talentum_project_id`, `talentum_public_id`, `talentum_whatsapp_url`, `talentum_slug`, `talentum_published_at`, `talentum_description`.

Tabelas: `job_posting_prescreening_questions`, `job_posting_prescreening_faq`.

---

## Step 3 — Backend: TalentumDescriptionService (DONE)

**Arquivo:** `worker-functions/src/infrastructure/services/TalentumDescriptionService.ts`

Groq (Llama 3.3 70B) gera texto formatado com 3 secoes:
1. "Descripcion de la Propuesta:" — gerada pelo Groq
2. "Perfil Profesional Sugerido:" — gerada pelo Groq
3. "El Marco de Acompanamiento:" — texto fixo institucional (sempre anexado)

### Input: TODOS os campos estruturados (sem texto livre)

```typescript
interface GenerateDescriptionInput {
  caseNumber: string;
  title: string;
  requiredProfessions: string[];
  requiredSex?: string;
  requiredExperience?: string;
  workerAttributes?: string;
  ageRangeMin?: number;
  ageRangeMax?: number;
  providersNeeded?: number;
  schedule?: Array<{ dayOfWeek: number; startTime: string; endTime: string }>;
  workSchedule?: string;
  city?: string;
  state?: string;
  serviceDeviceTypes?: string[];
  pathologyTypes?: string;
  dependencyLevel?: string;
  salaryText?: string;
  paymentDay?: string;
}
```

O prompt do Groq inclui TODOS os 15 campos. Regra: "OBLIGATORIO: Incluir TODA la informacion proporcionada. No omitir ningun dato."

---

## Step 4 — Backend: PublishVacancyToTalentum (DONE)

**Arquivo:** `worker-functions/src/application/use-cases/PublishVacancyToTalentumUseCase.ts`

**publish():** Valida (existe, nao publicada, tem perguntas) → gera descricao se falta → carrega perguntas+FAQ → POST Talentum → GET para whatsappUrl+slug → salva referencias em transacao.

**unpublish():** DELETE Talentum → limpa 5 colunas talentum_* em transacao.

**Endpoints (VacancyTalentumController):**
```
POST   /api/admin/vacancies/:id/publish-talentum
DELETE /api/admin/vacancies/:id/publish-talentum
POST   /api/admin/vacancies/:id/generate-talentum-description
GET    /api/admin/vacancies/:id/prescreening-config
POST   /api/admin/vacancies/:id/prescreening-config
```

---

## Step 5 — Backend: Migration campos completos + split controller (DONE)

**Migration:** `worker-functions/migrations/107_vacancy_form_complete_fields.sql`

### Colunas adicionadas em `job_postings`

| Coluna | Tipo | Default |
|--------|------|---------|
| `required_professions` | TEXT[] | '{}' |
| `required_sex` | TEXT | NULL |
| `age_range_min` | INTEGER | NULL |
| `age_range_max` | INTEGER | NULL |
| `required_experience` | TEXT | NULL |
| `worker_attributes` | TEXT | NULL |
| `pathology_types` | TEXT | NULL |
| `salary_text` | TEXT | 'A convenir' |
| `payment_day` | TEXT | NULL |
| `dependency_level` | TEXT | NULL |
| `service_device_types` | TEXT[] | '{}' |
| `schedule` | JSONB | NULL |

### Colunas removidas

`required_profession` (singular), `salary_range_min`, `salary_range_max`, `currency`, `preferred_age_range`, `required_experience_years`. Dados migrados antes da remocao.

**Nota:** `schedule_days_hours` foi MANTIDO para backward compatibility (MatchmakingService, ClickUpCaseRepository, etc. ainda leem). Sera removido em migration futura quando esses servicos migrarem para `schedule` JSONB.

### Controller split (limite 400 linhas)

| Controller | Responsabilidade |
|-----------|-----------------|
| `VacancyCrudController.ts` | POST/PUT/DELETE vacancies (21 campos) |
| `VacancyTalentumController.ts` | Talentum publish/unpublish + prescreening config |

---

## Step 6 — Frontend: Pagina multi-step de criacao (DONE)

**Rota:** `/admin/vacancies/new`

### Fluxo em 3 steps

```
┌─────────────────────────────────────────────────────────────────────┐
│  [●] Datos de la Vacante  ──  [○] Pre-Screening  ──  [○] Revision  │
└─────────────────────────────────────────────────────────────────────┘
```

**Step 1 — Datos de la Vacante**
Admin preenche 20 campos estruturados organizados em 5 secoes:

| Secao | Campos |
|-------|--------|
| Informacion del Caso | case_number (auto, read-only), title (auto, read-only), status |
| Perfil Profesional | required_professions (checkbox), required_sex, age_range_min/max, required_experience, worker_attributes, providers_needed |
| Ubicacion y Horarios | state (select provincias), city, service_device_types (checkbox), work_schedule, schedule (SchedulePicker → JSONB) |
| Informacion Clinica | pathology_types, dependency_level |
| Condiciones | salary_text, payment_day |
| Observaciones | daily_obs |

Validacao Zod: professions min 1, city min 2, devices min 1, schedule min 1 slot.

**Step 2 — Pre-Screening**
Admin configura perguntas de prescreening (min 1) + FAQ (opcional). Cada pergunta: texto, resposta esperada, peso 1-10, tipo de resposta (texto/audio), flags avancados (required, analyzed, earlyStoppage).

**Step 3 — Revision y Publicacion**
Ao avancar do Step 2, o sistema automaticamente:
1. Cria a vacante no backend (POST /api/admin/vacancies)
2. Salva prescreening (POST /prescreening-config)
3. Gera descricao via Groq (POST /generate-talentum-description)

Admin revisa:
- Todos os dados da vaga (read-only)
- Todas as perguntas de prescreening
- Descricao gerada para Talentum

Botao "Aceptar y enviar a Talentum" → publica na Talentum → redireciona para /admin/vacancies/:id.

### Arquivos

| Arquivo | Linhas | Descricao |
|---------|--------|-----------|
| `pages/admin/CreateVacancyPage.tsx` | 215 | Orquestrador com stepper + API calls |
| `components/features/admin/CreateVacancy/VacancyDataStep.tsx` | 291 | Step 1: formulario |
| `components/features/admin/CreateVacancy/PrescreeningStep.tsx` | 353 | Step 2: perguntas + FAQ |
| `components/features/admin/CreateVacancy/ReviewStep.tsx` | 267 | Step 3: revisao + publicacao |
| `components/features/admin/vacancy-form-schema.ts` | 174 | Schema Zod + constantes + conversao schedule |
| `components/features/admin/VacancySchedulePicker.tsx` | 139 | Componente de horarios (dias + franjas) |

### Formato `schedule` (JSONB)

```jsonc
[
  { "dayOfWeek": 1, "startTime": "08:00", "endTime": "14:00" },
  { "dayOfWeek": 3, "startTime": "08:00", "endTime": "14:00" }
]
// dayOfWeek: 0=Domingo, 1=Lunes, ..., 6=Sabado
```

O SchedulePicker produz formato UI (`{ days: string[], timeFrom, timeTo }`) que e convertido para JSONB no submit via `scheduleToJsonb()`. Na edicao, `jsonbToSchedule()` faz o caminho inverso.

---

## Step 7 — Frontend: Tela de detalhe da vaga (DONE)

**Rota:** `/admin/vacancies/:id`

Pagina de visualizacao com cards:
- VacancyStatusCard — status, pais, data, providers
- VacancyPatientCard — dados do paciente (se vinculado)
- VacancyRequirementsCard — requisitos LLM-enriched
- VacancyScheduleCard — horarios
- VacancyMeetLinksCard — links Google Meet editaveis inline
- VacancyEncuadresCard — kanban de enquadramentos
- VacancyPrescreeningConfig — perguntas + FAQ (editavel, com aviso se ja publicada)
- VacancyTalentumCard — status da publicacao + link WhatsApp + despublicar
- Tabela de publicacoes

Botao "Editar" abre VacancyFormModal para edicao dos campos da vaga.

---

## Step 8 — QA: Validacao completa (PENDENTE)

### Backend

- [x] Migration 107 roda sem erros
- [x] Dados migrados (required_profession → required_professions, salary → salary_text)
- [x] Colunas antigas removidas
- [x] `llm_parsed_schedule` removido de enrichment
- [x] POST /api/admin/vacancies aceita todos os 21 campos
- [x] PUT /api/admin/vacancies aceita todos os 21 campos
- [x] GET /api/admin/vacancies retorna todos os campos
- [x] TalentumDescriptionService usa 15 campos estruturados (sem worker_profile_sought)
- [x] `npm run build` compila sem erros
- [x] Testes unitarios passam (25/25 TalentumDescriptionService)
- [ ] E2E: POST /publish-talentum cria prescreening e salva referencias
- [ ] E2E: POST /publish-talentum falha 400 se nao ha perguntas
- [ ] E2E: POST /publish-talentum falha 409 se ja publicada
- [ ] E2E: DELETE /publish-talentum remove e limpa colunas
- [ ] E2E: GET/POST /prescreening-config CRUD funciona

### Frontend

- [x] `pnpm type-check` passa
- [x] `pnpm lint` passa
- [x] Testes unitarios passam (1849/1849)
- [x] i18n completo es-AR + pt-BR
- [ ] Fluxo multi-step: Step 1 valida e avanca
- [ ] Fluxo multi-step: Step 2 valida min 1 pergunta
- [ ] Fluxo multi-step: Step 3 mostra dados + descricao gerada
- [ ] Fluxo multi-step: "Aceptar y enviar" publica e redireciona
- [ ] Fluxo multi-step: botoes Anterior funcionam sem perder dados
- [ ] Schedule picker gera JSONB correto
- [ ] Checkbox groups funcionam como arrays
- [ ] Tela de detalhe exibe todos os dados
- [ ] Tela de detalhe: prescreening editavel com aviso se publicada
- [ ] Tela de detalhe: Talentum card exibe whatsappUrl copiavel
- [ ] Tela de detalhe: despublicar funciona

---

## Diagrama de Dependencias (final)

```
Step 1 (TalentumApiClient) ──┐
                              ├──→ Step 4 (Use Case + Endpoints) ──┐
Step 3 (DescriptionService) ─┘                                     │
                                                                    │
Step 2 (Migration 106) ──→ Step 5 (Migration 107 +                 │
                                    split controllers) ─────────────┤
                                                                    │
                                                            Step 6 (Multi-step page)
                                                                    │
                                                            Step 7 (Detail page)
                                                                    │
                                                            Step 8 (QA)
```

---

## Referencias

- API Talentum documentada: `docs/features/TALENTUM_OUTBOUND_API.md`
- Template de descricao: fornecido pelo COO (template GEM usado pelas recrutadoras)
- Schema `job_postings`: migrations 011, 035, 046, 047, 058, 064, 076, 080, 082, 106, 107
- Schema `worker_availability`: migration 104
- Padrao de use case: `worker-functions/src/application/use-cases/PublishVacancyToTalentumUseCase.ts`
