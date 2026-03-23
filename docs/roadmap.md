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