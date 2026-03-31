# Matching & Selecao (MAT)

## O que e

Motor de matchmaking que ranqueia workers por compatibilidade com vagas, combinado com um funil kanban para acompanhar o processo seletivo. O sistema pontua candidatos por localizacao, ocupacao, experiencia e preferencias, e permite ao coordenador gerenciar visualmente cada etapa via drag-and-drop.

## Por que existe

Com centenas de workers e dezenas de vagas simultaneas, a alocacao manual e inviavel. O matchmaking automatico pre-seleciona os candidatos mais adequados, e o kanban da visibilidade em tempo real do pipeline de selecao.

## Como funciona

### Matchmaking (3 fases)

```
POST /api/admin/vacancies/:id/match
  |
  v
Fase 1: Filtro SQL
  |  Ocupacao compativel
  |  Area de servico sobreposta
  |  Exclui workers com caso ativo (se exclude_active=true)
  v
Fase 2: Scoring
  |  Distancia geografica (PostGIS ST_Distance)
  |  Match de ocupacao
  |  Experiencia
  |  Match de idioma
  |  Sobreposicao de area de servico
  |  Penalidade por rejeicoes anteriores (-10 a -20 pts)
  |  Bonus por avaliacoes de qualidade (+10 a +15 pts)
  v
Fase 3: Enriquecimento LLM (background)
  |  Analise contextual do perfil vs. vaga
  |  Ajuste fino do score
  v
Resultados ordenados por score
  |  Salvos em worker_job_applications (application_status=under_review)
```

### Funil Kanban (6 colunas)

```
INVITED -> CONFIRMED -> INTERVIEWING -> SELECTED
                                     -> REJECTED
                                     -> PENDING
```

**Logica de classificacao automatica**:
- **SELECTED**: resultado = SELECCIONADO ou REEMPLAZO
- **REJECTED**: resultado = RECHAZADO, AT_NO_ACEPTA ou BLACKLIST
- **PENDING**: resultado = PENDIENTE ou REPROGRAMAR
- **INTERVIEWING**: entrevista hoje, ainda nao atendido
- **CONFIRMED**: tem meet link, data futura, nao atendido
- **INVITED**: todos os demais

### Resultado de Encuadre

Quando o coordenador move um card no kanban:

```
PUT /api/admin/encuadres/:id/move
  |  resultado: SELECCIONADO | RECHAZADO | AT_NO_ACEPTA | REPROGRAMAR | REEMPLAZO | BLACKLIST | PENDIENTE
  |  rejectionReasonCategory: obrigatorio se rejeitando
  |  rejectionReason: texto livre para categorias especificas
  v
Atualiza encuadre no banco
```

## Endpoints

| Metodo | Rota | Funcao |
|--------|------|--------|
| POST | `/api/admin/vacancies/:id/match` | Executar matchmaking |
| GET | `/api/admin/vacancies/:id/match-results` | Resultados ranqueados |
| GET | `/api/admin/vacancies/:id/funnel` | Encuadres agrupados por estagio |
| PUT | `/api/admin/encuadres/:id/move` | Mover encuadre (atualizar resultado) |
| PUT | `/api/admin/vacancies/:id/result` | Atualizar resultado (via VacanciesController) |
| GET | `/api/workers/:id/encuadres` | Historico de entrevistas do worker |
| GET | `/api/workers/:id/cases` | Casos agrupados do worker |

## Componentes

### Backend

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/infrastructure/services/MatchmakingService.ts` | Motor de scoring 3 fases |
| `src/interfaces/controllers/EncuadreFunnelController.ts` | Funil kanban + move |
| `src/interfaces/controllers/VacanciesController.ts` | Trigger match + results |
| `src/interfaces/controllers/EncuadreController.ts` | Historico encuadres |
| `src/application/use-cases/UpdateEncuadreResultUseCase.ts` | Logica de atualizacao |
| `src/infrastructure/repositories/EncuadreRepository.ts` | Persistencia encuadres |
| `src/domain/entities/Encuadre.ts` | Entidade encuadre |
| `src/domain/entities/WorkerJobApplication.ts` | Entidade match result |

### Frontend

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/presentation/pages/admin/VacancyMatchPage.tsx` | Motor de matching (UI) |
| `src/presentation/pages/admin/VacancyKanbanPage.tsx` | Kanban drag-and-drop |
| `src/presentation/components/features/admin/VacancyMatch/` | Componentes do match |
| `src/hooks/admin/useVacancyMatch.ts` | Hook match (run/filter/message) |
| `src/hooks/admin/useEncuadreFunnel.ts` | Hook kanban |

## Regras de negocio

- **Resultados validos**: SELECCIONADO, RECHAZADO, AT_NO_ACEPTA, REPROGRAMAR, REEMPLAZO, BLACKLIST, PENDIENTE
- **Categorias de rejeicao**: DISTANCE, SCHEDULE_INCOMPATIBLE, INSUFFICIENT_EXPERIENCE, SALARY_EXPECTATION, WORKER_DECLINED, OVERQUALIFIED, DEPENDENCY_MISMATCH, OTHER
- **rejectionReasonCategory**: obrigatorio ao rejeitar
- **Score de penalizacao**: historico de rejeicoes penaliza -10 a -20 pontos
- **Score de bonus**: avaliacoes de qualidade adicionam +10 a +15 pontos
- **Params do match**: top_n (default 20), radius_km (opcional), exclude_active (exclui workers com caso SELECCIONADO)
- **Flag alreadyApplied**: indica se worker se candidatou diretamente vs. adicionado pelo sistema
- **Campos LLM no encuadre**: llmInterestLevel, llmFollowUpPotential, llmAvailabilityNotes, llmRealRejectionReason, llmExtractedExperience

## Integracoes externas

- **PostGIS**: Calculo de distancia geografica
- **LLM Service (GROQ)**: Fase 3 do matchmaking + enriquecimento de encuadres
- **@dnd-kit**: Drag-and-drop no kanban (frontend)
