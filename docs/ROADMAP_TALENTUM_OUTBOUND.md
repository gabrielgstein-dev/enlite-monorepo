# Roadmap — Publicacao Automatica de Vagas na Talentum

> Permitir que o admin crie/edite vagas no painel Enlite com todos os campos necessarios, configure perguntas de prescreening, e publique diretamente na Talentum.chat com um switch. O Groq gera o texto formatado da descricao automaticamente a partir dos campos estruturados da vaga.

---

## Status Geral

| Step | Escopo | Status |
|------|--------|--------|
| **Step 1** | Backend: TalentumApiClient (servico encapsulado) | DONE |
| **Step 2** | Backend: Migration Talentum (colunas + tabelas prescreening) | DONE |
| **Step 3** | Backend: TalentumDescriptionService (Groq gera texto formatado) | DONE |
| **Step 4** | Backend: PublishVacancyToTalentum use case + endpoint | DONE |
| **Step 5** | Backend: Migration campos completos da vaga + atualizar controller | PENDENTE |
| **Step 6** | Frontend: Formulario completo de criar/editar vaga | PENDENTE |
| **Step 7** | Frontend: Configuracao de prescreening (perguntas + FAQ) | PENDENTE |
| **Step 8** | Frontend: Switch "Publicar en Talentum" + exibir whatsappUrl | PENDENTE |
| **Step 9** | QA: Validacao completa | PENDENTE |

---

## Contexto

### Fluxo manual atual (recrutadoras)
```
1. Coordenadora passa dados do caso
2. Recrutadora cola no GEM (Google Gemini) com template
3. GEM gera texto formatado (Secao A + B + C)
4. Recrutadora copia Secao B para planilha
5. Corrige manualmente se necessario
6. Importa no WordPress e cria prescreening manualmente na Talentum
```

### Fluxo automatizado (objetivo)
```
1. Admin cria/edita vaga no painel Enlite (formulario completo com TODOS os campos)
2. Groq gera automaticamente o texto formatado (descricao + perfil + marco)
3. Admin configura perguntas de prescreening por vaga
4. Admin ativa switch "Publicar en Talentum"
5. Backend chama API Talentum → cria prescreening → salva whatsappUrl
6. Admin compartilha link do bot com candidatos
7. Candidato faz prescreening no WhatsApp → webhook retorna resultados (fluxo existente)
```

### Decisoes de produto (acordadas em 2026-04-03)

1. **Todos os campos do CSV WordPress devem estar em `job_postings`** — nao depender de JOIN com patients, pois ainda nao ha registro de pacientes.
2. **`required_professions` e array** (TEXT[]) — uma vaga pode exigir AT e/ou CAREGIVER.
3. **Faixa etaria usa dois campos numericos** (`age_range_min`, `age_range_max`) — no frontend, "De XX a XX anos". Sem texto livre.
4. **Salario e texto livre** (`salary_text`) — default "A convenir". Colunas decimais antigas (`salary_range_min`, `salary_range_max`, `currency`) removidas.
5. **`schedule` e JSONB estruturado** — alinhado com `worker_availability` para matching. Substitui `schedule_days_hours` (texto) e `llm_parsed_schedule` (LLM).
6. **`service_device_types` e array** (TEXT[]) — multi-select no frontend. Valores: DOMICILIARIO, ESCOLAR, INSTITUCIONAL, COMUNITARIO, AMBULATORIO, INTERNACION, RESIDENCIAL, TRASLADO.
7. **`required_sex` e campo manual** — substitui `llm_required_sex` que foi movido para tabela de enrichment.
8. **`worker_profile_sought` permanece** — texto livre que alimenta o Groq para gerar a descricao Talentum.

### Documentacao de referencia
- API Talentum: `docs/TALENTUM_OUTBOUND_API.md`
- Gestao de vagas: `docs/features/vacancy-management.md`
- Webhooks inbound: `docs/features/webhooks-integrations.md`
- CSV de referencia: vagas WordPress exportadas (130+ vagas ativas)

---

## Step 1 — Backend: TalentumApiClient (DONE)

**Objetivo:** Client reutilizavel que encapsula toda comunicacao com a API Talentum (login RSA-OAEP, CRUD de prescreenings).

**Arquivo:** `worker-functions/src/infrastructure/services/TalentumApiClient.ts`

Metodos: `fromSecretManager()`, `createPrescreening()`, `getPrescreening()`, `deletePrescreening()`, `listPrescreenings()`.

---

## Step 2 — Backend: Migration Talentum (DONE)

**Objetivo:** Colunas Talentum em `job_postings` + tabelas de prescreening.

**Migration:** `worker-functions/migrations/106_add_talentum_outbound.sql`

Colunas: `talentum_project_id`, `talentum_public_id`, `talentum_whatsapp_url`, `talentum_slug`, `talentum_published_at`, `talentum_description`.

Tabelas: `job_posting_prescreening_questions`, `job_posting_prescreening_faq`.

---

## Step 3 — Backend: TalentumDescriptionService (DONE)

**Objetivo:** Groq (Llama 3.3 70B) gera texto formatado da descricao da vaga com 3 secoes.

**Arquivo:** `worker-functions/src/infrastructure/services/TalentumDescriptionService.ts`

**Nota:** O input do servico deve ser atualizado no Step 5 para usar os novos campos (`required_professions`, `required_sex`, `schedule`, `pathology_types`, `dependency_level`, `city`, `state`) em vez de depender de JOINs com patients ou campos LLM.

---

## Step 4 — Backend: PublishVacancyToTalentum (DONE)

**Objetivo:** Orquestrar: gerar descricao via Groq → chamar API Talentum → salvar referencias.

**Arquivo:** `worker-functions/src/application/usecases/PublishVacancyToTalentum.ts`

Endpoints: `POST /publish-talentum`, `POST /generate-talentum-description`, `DELETE /publish-talentum`.

---

## Step 5 — Backend: Migration campos completos + atualizar controller

**Objetivo:** Alinhar o schema `job_postings` com todos os campos necessarios para a operacao (baseado no CSV WordPress de 130+ vagas) e atualizar o controller para aceitar os novos campos.

### Migration: `107_vacancy_form_complete_fields.sql`

#### Colunas a ADICIONAR em `job_postings`

| Coluna | Tipo | Default | Mapeamento CSV |
|--------|------|---------|----------------|
| `required_professions` | TEXT[] | '{}' | Tipos de Trabalhador (AT, CAREGIVER, NURSE, KINESIOLOGIST, PSYCHOLOGIST) |
| `required_sex` | TEXT | NULL | Sexo do Trabalhador (M, F, BOTH) |
| `age_range_min` | INTEGER | NULL | Faixa Etaria — campo "De" |
| `age_range_max` | INTEGER | NULL | Faixa Etaria — campo "Ate" |
| `required_experience` | TEXT | NULL | Experiencia requerida (extraida de "Perfil do Trabalhador") |
| `worker_attributes` | TEXT | NULL | Atributos do Trabalhador ("Compromiso, empatia, manejo de crisis") |
| `pathology_types` | TEXT | NULL | Tipos de Patologias ("TLP, Adicciones") |
| `salary_text` | TEXT | 'A convenir' | Salario (texto livre, default "A convenir") |
| `payment_day` | TEXT | NULL | Dia de Pagamento ("Dia 20, a los 35 dias de gestion") |
| `dependency_level` | TEXT | NULL | Nivel de Dependencia (Leve, Moderado, Grave, Alto, Muy Grave) |
| `service_device_types` | TEXT[] | '{}' | Dispositivo de Servico (multi-select) |
| `schedule` | JSONB | NULL | Horarios estruturados para matching com worker_availability |

#### Colunas a REMOVER de `job_postings`

| Coluna | Tipo original | Motivo |
|--------|---------------|--------|
| `required_profession` | VARCHAR(50) | Substituida por `required_professions` TEXT[] |
| `salary_range_min` | DECIMAL(10,2) | Substituida por `salary_text` TEXT |
| `salary_range_max` | DECIMAL(10,2) | Substituida por `salary_text` TEXT |
| `currency` | CHAR(3) | Sem sentido sem campos decimais |
| `preferred_age_range` | VARCHAR(30) | Substituida por `age_range_min`/`age_range_max` |
| `required_experience_years` | VARCHAR(20) | Substituida por `required_experience` TEXT |
| `schedule_days_hours` | TEXT | Substituida por `schedule` JSONB |

#### Constraints a REMOVER

| Constraint | Tabela |
|-----------|--------|
| `valid_required_profession` | job_postings |
| `valid_salary_range` | job_postings |

#### Coluna a REMOVER de `job_postings_llm_enrichment`

| Coluna | Motivo |
|--------|--------|
| `llm_parsed_schedule` | Substituida por `schedule` JSONB manual em job_postings |

#### Migrar dados antes de dropar

```sql
-- required_profession → required_professions (array)
UPDATE job_postings
SET required_professions = ARRAY[required_profession]
WHERE required_profession IS NOT NULL;

-- salary_range → salary_text
UPDATE job_postings
SET salary_text = CONCAT(salary_range_min::TEXT, ' - ', salary_range_max::TEXT, ' ', currency)
WHERE salary_range_min IS NOT NULL;
```

#### Formato do campo `schedule` (JSONB)

Alinhado com a tabela `worker_availability` para facilitar matching:

```jsonc
[
  { "dayOfWeek": 1, "startTime": "08:00", "endTime": "16:00" },
  { "dayOfWeek": 3, "startTime": "08:00", "endTime": "16:00" },
  { "dayOfWeek": 5, "startTime": "08:00", "endTime": "16:00" }
]
// dayOfWeek: 0=Domingo, 1=Lunes, ..., 6=Sabado
```

#### Valores de `service_device_types`

| Valor | Descricao |
|-------|-----------|
| `DOMICILIARIO` | Atendimento no domicilio do paciente |
| `ESCOLAR` | Acompanhamento em escola |
| `INSTITUCIONAL` | Em clinica, hospital ou geriatrico |
| `COMUNITARIO` | Saidas, atividades na comunidade |
| `AMBULATORIO` | Acompanhamento ambulatorial |
| `INTERNACION` | Internacao psiquiatrica ou clinica |
| `RESIDENCIAL` | Residencia terapeutica ou geriatrica |
| `TRASLADO` | Traslados e transporte |

### Atualizar VacanciesController

**POST /api/admin/vacancies** — INSERT com todos os novos campos:

```sql
INSERT INTO job_postings (
  case_number, title, patient_id,
  required_professions, required_sex,
  age_range_min, age_range_max,
  worker_profile_sought, required_experience, worker_attributes,
  schedule, work_schedule,
  pathology_types, dependency_level,
  service_device_types,
  providers_needed, salary_text, payment_day,
  daily_obs, city, state,
  status, country
) VALUES (...)
```

**PUT /api/admin/vacancies/:id** — allowedFields atualizado:

```typescript
const allowedFields = [
  'title', 'patient_id',
  'required_professions', 'required_sex',
  'age_range_min', 'age_range_max',
  'worker_profile_sought', 'required_experience', 'worker_attributes',
  'schedule', 'work_schedule',
  'pathology_types', 'dependency_level',
  'service_device_types',
  'providers_needed', 'salary_text', 'payment_day',
  'daily_obs', 'city', 'state',
  'status',
];
```

### Atualizar TalentumDescriptionService input

Agora todos os dados vem direto de `job_postings`, sem JOIN com patients:

```typescript
interface GenerateDescriptionInput {
  caseNumber: string;
  title: string;
  requiredProfessions: string[];      // de job_postings.required_professions
  requiredSex?: string;               // de job_postings.required_sex
  workerProfileSought?: string;       // de job_postings.worker_profile_sought
  requiredExperience?: string;        // de job_postings.required_experience
  schedule?: object[];                // de job_postings.schedule (serializar para texto no prompt)
  city?: string;                      // de job_postings.city
  state?: string;                     // de job_postings.state
  pathologyTypes?: string;            // de job_postings.pathology_types
  dependencyLevel?: string;           // de job_postings.dependency_level
  serviceDeviceTypes?: string[];      // de job_postings.service_device_types
}
```

### Criterios de aceite

- CA-5.1: Migration roda sem erro em banco limpo e em banco existente
- CA-5.2: Dados existentes migrados (`required_profession` → `required_professions`, `salary` → `salary_text`)
- CA-5.3: Colunas antigas removidas apos migracao de dados
- CA-5.4: `llm_parsed_schedule` removido de `job_postings_llm_enrichment`
- CA-5.5: POST /api/admin/vacancies aceita todos os novos campos
- CA-5.6: PUT /api/admin/vacancies aceita todos os novos campos
- CA-5.7: GET /api/admin/vacancies retorna todos os novos campos
- CA-5.8: TalentumDescriptionService atualizado para usar campos diretos (sem JOIN patients)
- CA-5.9: `npm run build` compila sem erros
- CA-5.10: Nenhum arquivo ultrapassa 400 linhas

### Arquivos impactados

| Arquivo | Acao |
|---------|------|
| `worker-functions/migrations/107_vacancy_form_complete_fields.sql` | CRIAR |
| `worker-functions/src/interfaces/controllers/VacanciesController.ts` | MODIFICAR — POST/PUT/GET |
| `worker-functions/src/infrastructure/services/TalentumDescriptionService.ts` | MODIFICAR — novo input |

---

## Step 6 — Frontend: Formulario completo de criar/editar vaga

**Objetivo:** Redesenhar o formulario para capturar TODOS os campos da vaga. O admin preenche tudo numa unica tela, sem precisar navegar para outra pagina para completar dados. Ao final, pode gerar a descricao Talentum com um botao.

### O que existe hoje
- `VacancyFormModal.tsx` — formulario basico com 6 campos (title, worker_profile_sought, schedule, providers_needed, daily_obs, status)
- `AdminApiService.createVacancy()` e `updateVacancy()` — ja implementados

### O que criar

**Componente:** `VacancyFormModal.tsx` (reescrever)

**Layout do formulario — secoes logicas:**

```
┌─────────────────────────────────────────────────────────────────┐
│ Nueva Vacante / Editar Vacante                          [X]    │
│                                                                 │
│ ── Informacion del Caso ──                                      │
│                                                                 │
│ Numero de Caso*:   [auto-increment, read-only]                  │
│ Titulo:            [CASO {N} — read-only, auto-generado]        │
│ Status:            [BUSQUEDA ▼]                                 │
│                                                                 │
│ ── Perfil Profesional Buscado ──                                │
│                                                                 │
│ Tipo de Prestador*:      [☑ AT  ☑ Cuidador/a  ☐ Enfermero/a   │
│                           ☐ Kinesiologo/a  ☐ Psicologo/a]      │
│ Sexo requerido:          [Indistinto ▼] (M / F / Indistinto)   │
│ Edad del prestador:      De [___] a [___] anos                  │
│ Experiencia requerida:   [textarea                            ] │
│ Atributos del prestador: [textarea                            ] │
│ Cantidad de prestadores*:[input number, min 1                 ] │
│                                                                 │
│ ── Ubicacion y Horarios ──                                      │
│                                                                 │
│ Provincia*:        [Buenos Aires ▼]                             │
│ Localidad*:        [input text                                ] │
│ Dispositivo*:      [☑ Domiciliario  ☐ Escolar  ☐ Institucional │
│                     ☐ Comunitario  ☐ Ambulatorio  ☐ Internacion│
│                     ☐ Residencial  ☐ Traslado]                  │
│ Jornada:           [Full-time ▼] (full-time/part-time/flexible) │
│                                                                 │
│ Horarios*:  (schedule picker — dias + franjas horarias)         │
│ ┌─ Lun ─┐ ┌─ Mar ─┐ ┌─ Mie ─┐ ┌─ Jue ─┐ ┌─ Vie ─┐           │
│ │08-14h │ │08-14h │ │08-14h │ │08-14h │ │08-14h │           │
│ └───────┘ └───────┘ └───────┘ └───────┘ └───────┘           │
│ [+ Agregar franja horaria]                                      │
│                                                                 │
│ ── Informacion Clinica ──                                       │
│                                                                 │
│ Patologias:              [textarea                            ] │
│ Nivel de dependencia:    [Moderado ▼]                           │
│                          (Leve/Moderado/Grave/Alto/Muy Grave)   │
│                                                                 │
│ ── Condiciones ──                                               │
│                                                                 │
│ Salario:                 [input text, placeholder "A convenir"] │
│ Dia de pago:             [input text                          ] │
│                                                                 │
│ ── Descripcion General ──                                       │
│                                                                 │
│ Perfil buscado (texto libre para Groq):                         │
│ [textarea — este texto alimenta la generacion automatica      ] │
│ [de la descripcion para Talentum                              ] │
│                                                                 │
│ Observaciones internas:  [textarea                            ] │
│                                                                 │
│                                    [Cancelar]  [Guardar Vacante]│
└─────────────────────────────────────────────────────────────────┘
```

### Campos do formulario (completo)

| Campo | Tipo UI | Obrigatorio | Coluna backend | Validacao |
|-------|---------|-------------|----------------|-----------|
| Numero de Caso | read-only | Auto | `case_number` | Auto-increment |
| Titulo | read-only | Auto | `title` | "CASO {N}" |
| Status | select | Nao (default BUSQUEDA) | `status` | — |
| Tipo de Prestador | checkbox group | Sim (min 1) | `required_professions` | TEXT[] |
| Sexo requerido | select | Nao | `required_sex` | M/F/BOTH ou null |
| Edad (De) | input number | Nao | `age_range_min` | min 18 |
| Edad (Hasta) | input number | Nao | `age_range_max` | >= age_range_min |
| Experiencia requerida | textarea | Nao | `required_experience` | — |
| Atributos del prestador | textarea | Nao | `worker_attributes` | — |
| Cantidad de prestadores | input number | Sim | `providers_needed` | min 1 |
| Provincia | select | Sim | `state` | — |
| Localidad | input text | Sim | `city` | min 2 chars |
| Dispositivo de servicio | checkbox group | Sim (min 1) | `service_device_types` | TEXT[] |
| Jornada | select | Nao | `work_schedule` | full-time/part-time/flexible |
| Horarios | schedule picker | Sim | `schedule` | JSONB, min 1 slot |
| Patologias | textarea | Nao | `pathology_types` | — |
| Nivel de dependencia | select | Nao | `dependency_level` | Leve/Moderado/Grave/Alto/Muy Grave |
| Salario | input text | Nao | `salary_text` | Default "A convenir" |
| Dia de pago | input text | Nao | `payment_day` | — |
| Perfil buscado | textarea | Nao | `worker_profile_sought` | — |
| Observaciones | textarea | Nao | `daily_obs` | — |

### Schedule picker

O componente de horarios gera um JSON alinhado com `worker_availability`:

```jsonc
[
  { "dayOfWeek": 1, "startTime": "08:00", "endTime": "14:00" },
  { "dayOfWeek": 1, "startTime": "14:00", "endTime": "20:00" },
  { "dayOfWeek": 3, "startTime": "08:00", "endTime": "14:00" }
]
```

O admin seleciona dias e para cada dia define uma ou mais franjas horarias. Multiplas franjas por dia sao permitidas (ex: manha + tarde).

### Criterios de aceite

- CA-6.1: Modal abre ao clicar "Nueva Vacante" na lista
- CA-6.2: Modal abre ao clicar botao "Editar" na pagina de detalhe (pre-populado)
- CA-6.3: Validacao Zod: `required_professions` min 1, `city` min 2 chars, `schedule` min 1 slot, `service_device_types` min 1
- CA-6.4: `case_number` e `title` sao auto-gerados e read-only
- CA-6.5: `salary_text` default "A convenir" se nao preenchido
- CA-6.6: Schedule picker gera JSONB no formato `worker_availability`
- CA-6.7: Apos criar, redireciona para detalhe da vaga
- CA-6.8: Apos editar, recarrega dados da vaga
- CA-6.9: i18n em es-AR (todos os labels e mensagens)
- CA-6.10: `pnpm type-check` e `pnpm lint` passam

### Arquivos impactados

| Arquivo | Acao |
|---------|------|
| `enlite-frontend/src/presentation/components/features/admin/VacancyFormModal.tsx` | REESCREVER |
| `enlite-frontend/src/presentation/pages/admin/AdminVacanciesPage.tsx` | MODIFICAR — conectar botao |
| `enlite-frontend/src/presentation/pages/admin/VacancyDetailPage.tsx` | MODIFICAR — botao editar |
| `enlite-frontend/src/infrastructure/http/AdminApiService.ts` | MODIFICAR — payload atualizado |

---

## Step 7 — Frontend: Configuracao de prescreening (perguntas + FAQ)

**Objetivo:** Na tela de detalhe da vaga, secao para configurar as perguntas de prescreening e FAQ que serao enviadas para a Talentum.

### O que criar

**Componente:** `VacancyPrescreeningConfig.tsx`

**Layout (dentro da pagina de detalhe da vaga, nova secao/card):**

```
┌─────────────────────────────────────────────────────────┐
│ Configuracion Pre-Screening Talentum                    │
│                                                         │
│ [+ Agregar Pregunta]                                    │
│                                                         │
│ ┌─ Pregunta 1 ──────────────────────────────── [X] ──┐  │
│ │ Pregunta *:        [textarea                      ] │  │
│ │ Tipo de respuesta: [text v] [audio v]              │  │
│ │ Respuesta esperada*: [textarea                    ] │  │
│ │ Peso (1-10):       [slider ou input ___]           │  │
│ │                                                     │  │
│ │ > Configuracion avanzada                           │  │
│ │   [ ] Requerida  [ ] Analizada por IA  [ ] Early   │  │
│ └─────────────────────────────────────────────────────┘  │
│                                                         │
│ ── Preguntas Frecuentes (FAQ) ──                        │
│ [+ Agregar FAQ]                                         │
│                                                         │
│ ┌─ FAQ 1 ────────────────────────────────── [X] ────┐  │
│ │ Pregunta: [input                                  ] │  │
│ │ Respuesta: [textarea                              ] │  │
│ └─────────────────────────────────────────────────────┘  │
│                                                         │
│                              [Guardar Configuracion]    │
└─────────────────────────────────────────────────────────┘
```

### Endpoints necessarios no backend

```
GET    /api/admin/vacancies/:id/prescreening-config
POST   /api/admin/vacancies/:id/prescreening-config
```

O GET retorna perguntas + FAQ. O POST faz upsert (replace all).

### Criterios de aceite

- CA-7.1: Perguntas podem ser adicionadas, removidas e reordenadas (drag ou setas)
- CA-7.2: Cada pergunta tem validacao: `question` e `desiredResponse` obrigatorios, `weight` 1-10
- CA-7.3: Minimo 1 pergunta para poder publicar na Talentum
- CA-7.4: FAQ e opcional (pode ser vazio)
- CA-7.5: Dados persistem no banco (`job_posting_prescreening_questions` + `_faq`)
- CA-7.6: Se a vaga ja esta publicada na Talentum, exibir aviso "Ya publicada — cambios no se reflejan automaticamente"
- CA-7.7: i18n em es-AR
- CA-7.8: `pnpm type-check` e `pnpm lint` passam

### Arquivos impactados

| Arquivo | Acao |
|---------|------|
| `enlite-frontend/src/presentation/components/features/admin/VacancyDetail/VacancyPrescreeningConfig.tsx` | CRIAR |
| `enlite-frontend/src/presentation/pages/admin/VacancyDetailPage.tsx` | MODIFICAR — adicionar secao |
| `enlite-frontend/src/infrastructure/http/AdminApiService.ts` | MODIFICAR — novos metodos |
| `worker-functions/src/interfaces/controllers/VacanciesController.ts` | MODIFICAR — 2 endpoints |

---

## Step 8 — Frontend: Switch "Publicar en Talentum" + exibir whatsappUrl

**Objetivo:** Adicionar switch na tela de detalhe da vaga para publicar/despublicar na Talentum. Apos publicacao, exibir o link do bot WhatsApp.

### O que criar

**Componente:** `VacancyTalentumCard.tsx` (novo card na pagina de detalhe)

**Estado: nao publicada:**
```
┌──────────────────────────────────────────────────┐
│ Talentum Pre-Screening                           │
│                                                  │
│ Descripcion generada:                            │
│ ┌────────────────────────────────────────────┐   │
│ │ Descripcion de la Propuesta:               │   │
│ │ Se busca un profesional para...            │   │
│ └────────────────────────────────────────────┘   │
│ [Regenerar descripcion]                          │
│                                                  │
│ Publicar en Talentum:  [  OFF ]                  │
│                                                  │
│ ! Configura al menos 1 pregunta antes de publicar│
└──────────────────────────────────────────────────┘
```

**Estado: publicada:**
```
┌──────────────────────────────────────────────────┐
│ Talentum Pre-Screening                  Activo   │
│                                                  │
│ Link del bot WhatsApp:                           │
│ https://wa.me/5491127227852?text=...             │
│ [Copiar link]  [Abrir WhatsApp]                  │
│                                                  │
│ Slug: #u8m1outjd5                                │
│ Publicado: 02/04/2026 19:49                      │
│ Preguntas: 5                                     │
│                                                  │
│ Publicar en Talentum:  [ ON  ]                   │
│ ! Desactivar eliminara el pre-screening          │
└──────────────────────────────────────────────────┘
```

### Fluxo do switch

1. **OFF → ON:**
   - Validar: tem perguntas configuradas?
   - Se nao tem `talentum_description`: chamar `POST /generate-talentum-description` e mostrar preview
   - Confirmar: "Esto creara un pre-screening en Talentum. Continuar?"
   - Chamar `POST /api/admin/vacancies/:id/publish-talentum`
   - Atualizar card com `whatsappUrl`

2. **ON → OFF:**
   - Confirmar: "Esto eliminara el pre-screening de Talentum. Los candidatos ya no podran responder."
   - Chamar `DELETE /api/admin/vacancies/:id/publish-talentum`
   - Limpar card

### Criterios de aceite

- CA-8.1: Card exibe estado correto (publicado/nao publicado) baseado em `talentum_project_id`
- CA-8.2: Switch desabilitado se nao ha perguntas configuradas (com tooltip explicativo)
- CA-8.3: Descricao pode ser visualizada e regenerada antes de publicar
- CA-8.4: Apos publicar, link do WhatsApp e exibido e copiavel
- CA-8.5: Despublicar pede confirmacao e chama DELETE
- CA-8.6: Loading state durante publicacao (switch desabilitado + spinner)
- CA-8.7: Erro da API Talentum exibido como toast
- CA-8.8: i18n em es-AR

### Arquivos impactados

| Arquivo | Acao |
|---------|------|
| `enlite-frontend/src/presentation/components/features/admin/VacancyDetail/VacancyTalentumCard.tsx` | CRIAR |
| `enlite-frontend/src/presentation/pages/admin/VacancyDetailPage.tsx` | MODIFICAR — adicionar card |
| `enlite-frontend/src/infrastructure/http/AdminApiService.ts` | MODIFICAR — 3 novos metodos |
| `enlite-frontend/src/hooks/admin/useVacancyDetail.ts` | MODIFICAR — incluir dados Talentum |

---

## Step 9 — QA: Validacao completa

### Backend

- [ ] Migration 107 roda sem erros (banco limpo + existente)
- [ ] Dados migrados corretamente (required_profession → required_professions, salary → salary_text)
- [ ] Colunas antigas removidas apos migracao
- [ ] `llm_parsed_schedule` removido de `job_postings_llm_enrichment`
- [ ] POST /api/admin/vacancies aceita TODOS os novos campos
- [ ] PUT /api/admin/vacancies aceita TODOS os novos campos
- [ ] GET /api/admin/vacancies retorna TODOS os novos campos
- [ ] TalentumDescriptionService usa campos diretos de job_postings
- [ ] `TalentumApiClient`: login + CRUD funcionam
- [ ] `POST /publish-talentum`: cria prescreening e salva referencias
- [ ] `POST /publish-talentum`: falha 400 se nao ha perguntas
- [ ] `POST /publish-talentum`: falha 409 se ja publicada
- [ ] `DELETE /publish-talentum`: remove da Talentum e limpa colunas
- [ ] `GET/POST /prescreening-config`: CRUD de perguntas funciona
- [ ] `npm run build` compila sem erros
- [ ] Nenhum arquivo ultrapassa 400 linhas

### Frontend

- [ ] Modal criar vaga: abre, todos os campos funcionam, valida, cria, redireciona
- [ ] Modal editar vaga: abre pre-populado com TODOS os campos, salva
- [ ] Schedule picker: gera JSONB correto, multiplas franjas por dia
- [ ] Checkbox groups: required_professions e service_device_types funcionam como arrays
- [ ] Select campos: required_sex, dependency_level, work_schedule, state
- [ ] Campos numericos: age_range_min/max com validacao (max >= min)
- [ ] salary_text default "A convenir" quando vazio
- [ ] Prescreening config: adicionar/remover/reordenar perguntas
- [ ] Prescreening config: validacao (min 1 pergunta para publicar)
- [ ] Switch Talentum: publica com confirmacao
- [ ] Switch Talentum: despublica com confirmacao
- [ ] Link WhatsApp: exibido e copiavel apos publicacao
- [ ] Descricao: gerada automaticamente e editavel/regeneravel
- [ ] `pnpm type-check` passa
- [ ] `pnpm lint` passa
- [ ] i18n: todos os textos em es-AR

---

## Diagrama de Dependencias

```
Step 1 (TalentumApiClient) ──┐
                              ├──→ Step 4 (Use Case + Endpoints) ──┐
Step 3 (DescriptionService) ─┘                                     │
                                                                    │
Step 2 (Migration Talentum) ──→ Step 5 (Migration campos +         │
                                        controller update) ────────┤
                                         │                         │
                                         ├──→ Step 6 (Form frontend)
                                         │                         │
                                         ├──→ Step 7 (Prescreening)│
                                         │                         │
                                         └──→ Step 8 (Switch)──────┤
                                                                    │
                                                                    └──→ Step 9 (QA)
```

**Ordem recomendada de execucao:**
1. Steps 1 + 2 + 3 (backend, DONE)
2. Step 4 (backend, DONE)
3. **Step 5** (migration + controller — PROXIMO)
4. Steps 6 + 7 (frontend, podem ser paralelos, dependem de 5)
5. Step 8 (depende de 4, 6 e 7)
6. Step 9 (depende de todos)

---

## Referencias

- API Talentum documentada: `docs/TALENTUM_OUTBOUND_API.md`
- Template de descricao: fornecido pelo COO (template GEM usado pelas recrutadoras)
- Groq existente: `worker-functions/src/infrastructure/services/JobPostingEnrichmentService.ts`
- Schema `job_postings`: migrations 011, 035, 046, 047, 058, 064, 076, 080, 082, 106
- Schema `worker_availability`: migration 104
- Padrao de use case: `worker-functions/src/application/usecases/ProcessTalentumPrescreening.ts`
- CSV de referencia WordPress: 130+ vagas ativas com todos os campos operacionais
