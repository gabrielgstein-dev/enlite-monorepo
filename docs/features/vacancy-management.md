# Gestao de Vagas (VAC)

## O que e

CRUD completo de vagas (casos/job postings) com enriquecimento automatico via LLM. Cada vaga representa um caso clinico que precisa de um ou mais ATs. O sistema extrai campos estruturados (requisitos, horarios, especialidades) a partir de descricoes em texto livre usando IA.

## Por que existe

Coordenadores cadastram vagas com descricoes em texto livre ("Preciso de AT para paciente autista, seg-qua-sex das 8h as 12h zona norte"). O sistema precisa transformar isso em dados estruturados para alimentar o matchmaking automatico.

## Como funciona

### Ciclo de vida da vaga

```
Coordenador cria vaga
  |  POST /api/admin/vacancies
  |  Titulo, perfil buscado, horarios, paciente
  v
Auto-enriquecimento LLM (background)
  |  Extrai: sexo requerido, profissao, especialidades, diagnosticos, horarios parseados
  v
Status: BUSQUEDA (busca ativa)
  |  Auto-trigger matchmaking (setImmediate)
  v
Coordenador gerencia candidatos via Kanban/Match
  |  ...
  v
CUBIERTO (coberto) ou CANCELADO
```

### Enriquecimento LLM

```
Texto livre (worker_profile_sought + schedule_days_hours)
  |  GROQ API (LLM)
  v
Campos extraidos:
  - required_sex (M/F/INDIFFERENT)
  - required_profession (AT/CAREGIVER/NURSE/...)
  - required_specialties[]
  - required_diagnoses[]
  - parsed_schedule (dias + horarios estruturados)
  - daily_observations
```

Re-enriquecimento automatico quando campos de texto livre sao atualizados.

## Endpoints

| Metodo | Rota | Funcao |
|--------|------|--------|
| GET | `/api/admin/vacancies` | Listar vagas (filtros: search, client, status, priority) |
| GET | `/api/admin/vacancies/stats` | Estatisticas (dias aberta, em selecao, media de fechamento) |
| GET | `/api/admin/vacancies/:id` | Detalhe com encuadres e publicacoes |
| POST | `/api/admin/vacancies` | Criar vaga |
| PUT | `/api/admin/vacancies/:id` | Atualizar vaga |
| DELETE | `/api/admin/vacancies/:id` | Soft delete (status=closed) |
| POST | `/api/admin/vacancies/:id/enrich` | Re-enriquecer via LLM |

## Componentes

### Backend

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/interfaces/controllers/VacanciesController.ts` | CRUD + enrich + match |
| `src/infrastructure/repositories/JobPostingARRepository.ts` | Persistencia vagas |
| `src/infrastructure/services/JobPostingEnrichmentService.ts` | Enriquecimento LLM |
| `src/domain/entities/JobPosting.ts` | Entidade vaga |

### Frontend

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/presentation/pages/admin/AdminVacanciesPage.tsx` | Lista de vagas |
| `src/presentation/pages/admin/VacancyDetailPage.tsx` | Detalhe da vaga |
| `src/presentation/components/features/admin/VacancyDetail/` | Cards de detalhe |
| `src/hooks/admin/useVacanciesData.ts` | Hook lista vagas |
| `src/hooks/admin/useVacancyDetail.ts` | Hook detalhe vaga |

## Regras de negocio

- **Status**: BUSQUEDA (busca ativa), REEMPLAZO (substituicao), CUBIERTO (coberto), CANCELADO, closed (soft delete)
- **Prioridade**: URGENT, HIGH, NORMAL, LOW
- **Auto-enrich**: Dispara automaticamente na criacao se `worker_profile_sought` ou `schedule_days_hours` preenchidos
- **Auto-match**: Dispara em background via `setImmediate` (nao bloqueia resposta)
- **Re-enrich**: Dispara automaticamente no update se campos de texto livre mudaram
- **Soft delete**: `DELETE` muda status para `closed`, nao remove do banco
- **Campos permitidos**: title, worker_profile_sought, schedule_days_hours, providers_needed, status, daily_obs, patient_id
- **Distancia geografica**: Calculada via PostGIS (ST_Distance) para ranking

## Integracoes externas

- **GROQ LLM API**: Enriquecimento de texto livre em campos estruturados
- **PostGIS**: Calculo de distancia geografica para matchmaking
- **Google Calendar**: Resolucao de datetime de links Google Meet
