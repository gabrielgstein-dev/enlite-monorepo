📂 Enlite Health Platform - Master Implementation Plan
Este documento detalha a construção da infraestrutura técnica da Enlite Health, substituindo soluções SaaS de alto custo (Keragon) por uma stack robusta e escalável (n8n self-hosted + GCP).

🧩 Stack Tecnológica
Frontend: React (Web App hospedado no Google Cloud)

Auth: Google Cloud Identity Platform (GCP - HIPAA Compliant)

Backend: Node.js (TypeScript) em Google Cloud Functions

Banco de Dados: Cloud SQL (PostgreSQL 15)

Automação: n8n (Hospedado no GCP)

Comunicação: API Gateway para HubSpot, Twilio e Google Calendar

🏗️ Fase 1: Setup do Ambiente Local (Docker & Scaffold)
Objetivo: Criar um espelho funcional da nuvem na máquina do desenvolvedor.

1.1 Orquestração com Docker
Crie o arquivo docker-compose.yml na raiz:

YAML
services:
  postgres-enlite:
    image: postgres:15
    container_name: enlite_db
    environment:
      POSTGRES_DB: enlite_production
      POSTGRES_USER: enlite_admin
      POSTGRES_PASSWORD: enlite_password
    ports:
      - "5432:5432"

  n8n-enlite:
    image: n8nio/n8n:latest
    container_name: enlite_n8n
    ports:
      - "5678:5678"
    environment:
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=admin
      - N8N_BASIC_AUTH_PASSWORD=admin
    volumes:
      - n8n_data:/home/node/.n8n

volumes:
  n8n_data:
1.2 Estrutura de Pastas (Clean Architecture)
Plaintext
backend-functions/
├── src/
│   ├── domain/         # Entidades (Worker) e Interfaces de Repositório
│   ├── application/    # Casos de Uso (InitWorker, SaveStep)
│   ├── infrastructure/ # Implementações (PostgresRepository, n8nDispatcher)
│   └── interfaces/     # Cloud Functions Handlers (Express)
🗄️ Fase 2: Camada de Dados (PostgreSQL)
Objetivo: Implementar o schema relacional preparado para auditoria.

2.1 Schema de Workers (DDL)
Implementar tabelas com suporte a UUID e Timestamps:

workers: Dados cadastrais, status e step atual.

worker_service_areas: Raio de atendimento (KM) e Georeferenciamento.

worker_availability: Slots de horários por dia da semana.

worker_quiz_responses: Histórico de respostas do vídeo/quiz.

⚙️ Fase 3: Backend & Dispatcher (n8n Integration)
Objetivo: Criar a "cola" lógica sem depender de ferramentas SaaS externas.

3.1 O Dispatcher de Eventos
Em infrastructure/services/EventDispatcher.ts, o backend deve notificar o n8n sobre mudanças de estado:

TypeScript
async function notifyStepCompleted(workerId: string, step: number, data: any) {
  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  await axios.post(webhookUrl, {
    event: 'worker.step.completed',
    payload: { workerId, step, data }
  });
}
3.2 Repositório com Singleton
Garantir que a conexão com o banco seja resiliente e única por instância da Cloud Function.

🤖 Fase 4: Automação No-Code (n8n Workflows)
Objetivo: Substituir o Keragon para vincular ferramentas de negócio.

4.1 Workflow de Onboarding (HubSpot + Twilio)
Gatilho: Webhook (recebe dados da Cloud Function).

Lógica:

Se step == 2: Sincronizar dados com HubSpot CRM.

Se step == 4: Criar evento de disponibilidade no Google Calendar.

Se status == "review": Disparar SMS via Twilio.

📱 Fase 5: Frontend (React)
Objetivo: Interface de alta performance integrada à API.

5.1 Configuração de API
Auth: Configurar autenticação JWT do Identity Platform.

Endpoints:

GET /me: Recupera progresso do usuário.

PUT /step: Envia dados de cada tela para o Cloud SQL via Cloud Functions.

UX: Implementar PinCode (OTP 4 dígitos) e Google Maps com círculo de raio dinâmico.

Deploy: Google Cloud (Cloud Run ou Firebase Hosting).

📜 Fase 6: Windsurf Orchestration (Arquivos de Contexto)
Objetivo: Manter o Windsurf e seus subagentes alinhados ao projeto.

6.1 Arquivo .windsurfrules
YAML
rules:
  - "Sempre consulte /docs/progress.md antes de editar código."
  - "Siga Clean Architecture: Separe Domain de Infrastructure."
  - "Nunca exponha PII em logs (Compliance HIPAA)."
  - "Use o Result Pattern para retornos de funções (Value/Error)."
6.2 Arquivo docs/progress.md (Update Log)
Markdown
# Status Atual
- [x] Definição de Arquitetura e Stack.
- [ ] Setup Docker (Postgres + n8n).
- [ ] Implementação do Schema SQL.
- [ ] Mock do Identity Platform para dev local.

---

## 📥 Fase 7: Import de Dados Operacionais (Planilha Operativa)

**Objetivo:** Migrar os dados históricos da operação (recrutamento, encuadres, cases) do Excel para o banco relacional.

### 7.1 Migrations adicionadas (035–045)

| Migration | Descrição |
|-----------|-----------|
| 035 | `clickup_cases` — casos do ClickUp |
| 036 | `job_posting_comments` |
| 037 | `patients` — cadastro de pacientes |
| 038 | Normaliza relações de pacientes |
| 039 | Remove campos redundantes de `job_postings` |
| 040 | Consolida colunas do ClickUp |
| 041 | Renomeia `source_id` → `clickup_task_id` |
| 042 | Expande campos da `planilla_operativa` em `encuadres` |
| 043 | `worker_placement_audits` — auditoria de alocações |
| 044 | `coordinator_weekly_schedules` — agenda dos coordenadores |
| 045 | Corrige constraint de `rejection_reason` |

### 7.2 Infra de importação

- **`scripts/import-excel-cli.ts`** — CLI para importar arquivos Excel/CSV diretamente no banco. Cria um `import_job` e chama `PlanilhaImporter`.
- **`scripts/import-all-excel.ts`** — importa todos os arquivos da pasta `docs/excel/` em sequência.
- **`src/infrastructure/scripts/import-planilhas.ts`** — `PlanilhaImporter` detecta o tipo de planilha (ana_care, candidatos, planilla_operativa, talent_search, clickup) e despacha para o importador correto. Suporta deduplicação por hash de arquivo, upsert de workers por telefone/email/CUIT, e sincronização pós-import.
- **`src/infrastructure/repositories/EncuadreRepository.ts`** — upsert em bulk via `UNNEST` arrays para alta performance. Inclui `syncToWorkerJobApplications()` que sincroniza o resultado dos encuadres com o pipeline de candidatura.

### 7.3 Resultado da importação (Planilla Operativa Encuadre.xlsx)

| Tabela | Registros |
|--------|-----------|
| `encuadres` | 28.513 |
| `workers` | 5.703 |
| `job_postings` | 299 |
| `worker_job_applications` | 10.741 |

**Distribuição do funil (`worker_job_applications`):**
- `INTERVIEW_SCHEDULED`: 5.116
- `REJECTED`: 2.439
- `QUALIFIED` (selecionados/reemplazo): 1.718
- `APPLIED` (sem resultado ainda): 1.344
- `INTERVIEWED`: 124

### 7.4 Bugs corrigidos durante o import

1. **`interview_time` type mismatch** — `UNNEST($10::text[])` causava erro `column is of type time without time zone but expression is of type text`. Corrigido para `NULLIF(UNNEST($10::text[]), '')::time`.
2. **Duplicatas em `syncToWorkerJobApplications`** — múltiplos encuadres com mesmo `(worker_id, job_posting_id)` causavam `ON CONFLICT DO UPDATE command cannot affect row a second time`. Corrigido usando `DISTINCT ON (worker_id, job_posting_id)` com prioridade pelo `resultado` mais avançado no funil.

### 7.5 Arquitetura dos dados operacionais

```
encuadres (detalhe operacional)
  └─► worker_job_applications (pipeline de interesse/candidatura)
        worker_id + job_posting_id + funnel_stage + status
```

- **`encuadres`**: registro detalhado de cada sessão de encuadre — observações do recrutador, análise LLM, documentação (CV, DNI, CBU...), resultado (SELECCIONADO / RECHAZADO / REPROGRAMAR / etc.)
- **`worker_job_applications`**: visão leve do pipeline — em que fase está o interesse do worker em uma vaga específica (APPLIED → INTERVIEW_SCHEDULED → INTERVIEWED → QUALIFIED/REJECTED)

---

## 🤖 Fase 8: Matchmaking com LLM (3 Fases)

**Objetivo:** Recomendar automaticamente os melhores workers para uma vaga específica com scoring híbrido (determinístico + LLM).

### 8.1 Arquitetura do Matchmaking

O matchmaking funciona em 3 fases encadeadas:

```
Fase 1 — Hard Filter (SQL)
  └─ Elimina candidatos incompatíveis:
     • blacklist (JOIN blacklist bl)
     • availability_status = ONBOARDING ou INACTIVE
     • occupation incompatível
     • fora do raio geográfico (ST_DWithin via PostGIS, quando radiusKm fornecido)
     • exclude_active=true → remove workers com casos SELECCIONADO em vagas abertas

Fase 2 — Structured Score (em memória, 0–100)
  └─ Scoring determinístico por campos estruturados:
     • occupation match (40 pts)
     • distância via haversine: <5km=35, 5-10km=28, 10-20km=18, 20-40km=8, >40km=2 (35 pts)
     • preferências diagnósticas (25 pts)

Fase 3 — LLM Score (top N, 0–100)
  └─ Groq (llama-3.3-70b-versatile) analisa perfil completo:
     • reasoning + strengths + redFlags
     • prompt inclui: distância, histórico de encuadres, casos ativos e horários estimados
     • KMS decrypts first_name, last_name, sex apenas para esses N workers

Score final = structured_score × 0.35 + llm_score × 0.65
```

### 8.2 Migrations adicionadas (046–052)

| Migration | Descrição |
|-----------|-----------|
| 046 | `worker_job_applications` — tabela de match results |
| 047 | Campos LLM em `job_postings`: `llm_required_sex`, `llm_required_profession`, `llm_required_specialties`, `llm_required_diagnoses`, `llm_parsed_schedule`, `llm_enriched_at` |
| 048 | `lat`, `lng`, `location GEOGRAPHY GENERATED ALWAYS` em `worker_locations` |
| 049 | `ana_care_status VARCHAR(60)` em `workers` (campo raw do Ana Care para auditoria) |
| 050 | `availability_status VARCHAR(20)` em `workers` — campo canônico e agnóstico de plataforma |
| 051 | Expande constraint de `overall_status` para incluir todos os estados do funil Talentum |
| 052 | Adiciona `NOT_QUALIFIED` ao constraint de `overall_status` |

### 8.3 Campos de status — visão geral

#### `overall_status` — funil Talentum (recrutamento)

| Valor | Significado |
|-------|-------------|
| `PRE_TALENTUM` | Entrou na plataforma Talentum mas não completou o formulário |
| `QUALIFIED` | Apto segundo o Talentum |
| `IN_DOUBT` | Perfil com dúvidas, precisa de avaliação |
| `NOT_QUALIFIED` | Não apto |
| `MESSAGE_SENT` | Mensagem enviada para subir documentação |
| `ACTIVE` | Passou por todo o processo e está ativo no Ana Care |
| `INACTIVE` | Inativo |
| `BLACKLISTED` | Bloqueado |
| `HIRED` | Contratado |

> **Importante:** `ACTIVE` não é um estado do Talentum. É atribuído quando o worker entra no Ana Care como "Activo". O erro anterior era que todos os workers eram importados com `overall_status = 'ACTIVE'` como default — isso foi corrigido.

#### `availability_status` — disponibilidade canônica (agnóstico de plataforma)

| Valor | Quando |
|-------|--------|
| `AVAILABLE` | Pode ser contactado (Ana Care: "En espera de servicio" ou "Cubriendo guardias") |
| `ACTIVE` | Atendendo paciente ativo (Ana Care: "Activo") |
| `ONBOARDING` | Em processo de contratação / pré-registro |
| `INACTIVE` | Baixa / desligado |
| `NULL` | Não sincronizado ainda |

> Qualquer plataforma (Ana Care, site próprio, admin) pode popular este campo sem acoplamento.

#### `registrationWarning` — campo display derivado de `overall_status`

Exibido no resultado do matchmaking para alertar coordenadores sobre o estado do registro do worker sem excluí-lo do match:

| `overall_status` | Aviso |
|-----------------|-------|
| `PRE_TALENTUM` | "Registro incompleto no Talentum" |
| `QUALIFIED` | "Qualificado pelo Talentum, aguardando documentação" |
| `IN_DOUBT` | "Perfil com dúvidas no Talentum" |
| `MESSAGE_SENT` | "Mensagem enviada para subir documentação" |
| `ACTIVE` / outros | `null` (sem aviso) |

### 8.4 Filtros do Hard Filter (Fase 1)

O `overall_status` **não é usado como filtro** no matchmaking — qualquer estágio do funil Talentum pode ser candidato. Os filtros aplicados são:

- `blacklist` JOIN eliminando workers bloqueados
- `availability_status NOT IN ('ONBOARDING', 'INACTIVE')` (quando preenchido)
- `occupation` match (ou `AMBOS`)
- `radiusKm` via PostGIS ST_DWithin (quando job tem coords e parâmetro fornecido)
- `exclude_active=true` → exclui workers com `SELECCIONADO` em vagas abertas

### 8.5 Histórico do worker no prompt LLM

O prompt da Fase 3 inclui, sem chamadas LLM extras:

- **Casos ativos**: encuadres com `resultado = SELECCIONADO` em vagas abertas
- **Horário estimado**: `llm_parsed_schedule` da vaga correspondente ao encuadre ativo
- **Distância em km**: calculada via haversine (lat/lng do worker vs. job)

Exemplo de contexto passado ao LLM:
```
Worker tem 2 caso(s) ativo(s):
  - Vaga #abc: Seg, Qua, Sex 08:00-16:00 (estimado)
  - Vaga #def: Ter, Qui 12:00-20:00 (estimado)
Distância ao local: 4.2 km
```

### 8.6 Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/admin/vacancies/:id/match` | Roda matchmaking para a vaga. Params: `topN`, `radiusKm`, `exclude_active` |
| `POST` | `/api/admin/vacancies` | Cria vaga e dispara enrich + match em background (`setImmediate`) |

### 8.7 Serviços envolvidos

- **`MatchmakingService`** — orquestra as 3 fases, salva resultados em `worker_job_applications`
- **`JobPostingEnrichmentService`** — enriquece vaga com LLM antes do match (extrai occupation, specialties, diagnoses, schedule)
- **`KMSEncryptionService`** — decripta `first_name`, `last_name`, `sex` apenas para os top N

### 8.8 Scripts relacionados

| Script (pnpm) | Descrição |
|---------------|-----------|
| `sync:talentum` | Corrige `overall_status` dos workers existentes lendo CANDIDATOS.xlsx |
| `sync:talentum:dry` | Preview sem salvar |
| `sync:ana-care` | Sincroniza `ana_care_status` e `availability_status` do Ana Care Control.xlsx |
| `sync:ana-care:dry` | Preview sem salvar |
| `geocode:jobs` | Geocodifica vagas sem lat/lng via Google Maps |

### 8.9 Bugs corrigidos durante o desenvolvimento

1. **`column "wl.address" must appear in the GROUP BY clause`** — `wl.address` adicionado ao GROUP BY no `hardFilter`
2. **`overall_status` CHECK constraint** — migration 026 só permitia `ACTIVE/INACTIVE/BLACKLISTED/HIRED`, quebrando ao inserir valores Talentum. Corrigido na migration 051.
3. **Conexão do pool caindo** — scripts de sync usavam apenas `DATABASE_URL`; adicionado fallback para `DB_HOST/DB_NAME/DB_USER/DB_PASSWORD` individuais
4. **Todos workers importados como `ACTIVE`** — default errado no import. Corrigido para ler a coluna `Status` do Excel e mapear para o enum correto. Script `sync:talentum` aplica correção nos dados existentes.
5. **`work_zone` null para maioria dos workers** — fallback adicionado: usa `wl.address` quando `work_zone` é null; distância calculada via haversine com `lat/lng`

### 8.10 Fluxo de onboarding de dados (ordem de execução)

```bash
# 1. Importar planilhas (workers, encuadres, casos, candidatos)
pnpm import:all:prod

# 2. Corrigir overall_status dos workers existentes (one-time fix)
pnpm sync:talentum

# 3. Sincronizar availability_status do Ana Care
pnpm sync:ana-care

# 4. Geocodificar vagas (lat/lng para filtro geográfico)
pnpm geocode:jobs

# 5. Enriquecer encuadres com LLM (batch, pode ser rodado em background)
npx ts-node -r dotenv/config scripts/enrich-encuadres.ts

# 6. Testar matchmaking
npx ts-node -r dotenv/config scripts/test-matchmaking.ts
```

---

## 📱 Fase 9: Módulo de Mensagens (WhatsApp Business via Twilio)

**Objetivo:** Enviar mensagens WhatsApp transacionais diretamente do backend, sem depender do n8n para disparos síncronos (confirmações, alertas, notificações de match).

### 9.1 Arquitetura

```
IMessagingService (domain/ports)
  └─► TwilioMessagingService (infrastructure/services)
        └─► Twilio SDK → WhatsApp Business API (número provisionado)

MessagingController (interfaces/controllers)
  ├─ POST /api/admin/messaging/whatsapp         → envia por workerId (busca número no DB)
  └─ POST /api/admin/messaging/whatsapp/direct  → envia direto para um número
```

### 9.2 Decisão de arquitetura: Twilio direto vs n8n + Twilio

| Cenário | Responsável |
|---------|-------------|
| Mensagem transacional imediata (confirmação, alerta de match) | **Twilio direto** (este módulo) |
| Fluxo automatizado com condições / agendamento / drip | **n8n** (via `EventDispatcher`) |

O n8n continua sendo o orquestrador de fluxos complexos; o `TwilioMessagingService` lida apenas com disparos síncronos iniciados por ação do admin ou use case.

### 9.3 Componentes criados

| Arquivo | Camada | Descrição |
|---------|--------|-----------|
| `src/domain/ports/IMessagingService.ts` | Domain | Contrato `sendWhatsApp()` com `Result<MessageSentResult>` |
| `src/infrastructure/services/TwilioMessagingService.ts` | Infrastructure | Implementa o port usando o SDK oficial `twilio@5` |
| `src/interfaces/controllers/MessagingController.ts` | Interfaces | Dois endpoints: por `workerId` e por número direto |

### 9.4 Normalização de números

O `TwilioMessagingService` normaliza automaticamente para E.164:

- Números já em E.164 (`+54...`) → passam direto
- 10 dígitos sem DDI → Argentina (`+54...`)
- 11 dígitos com `54` sem `+` e 13 dígitos com `55` → Brasil/Argentina com prefixo

O campo `whatsapp_phone` tem prioridade sobre `phone` ao buscar o número do worker.

### 9.5 Variáveis de ambiente

```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_WHATSAPP_NUMBER=+54XXXXXXXXXX   # número provisionado no Twilio
```

### 9.6 Dependência adicionada

```
twilio@5.13.1  (ships with TypeScript types)
```