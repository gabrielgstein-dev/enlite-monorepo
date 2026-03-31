# Roadmap — Sistema de Recrutamento e Matching de ATs

> Substituir planilhas manuais (_Base1, _Índice) por um sistema centralizado que automatiza o fluxo completo de encuadres: criar vagas, disparar convites, agendar entrevistas, gerenciar o funil e aprender com rejeições para melhorar o matching.

---

## Status Geral

| Wave | Escopo | Status |
|------|--------|--------|
| **Wave 1** | Dados Estruturados + Feedback de Rejeição no Match | **CONCLUÍDA** |
| **Wave 3** | Kanban de Encuadres + Dashboard Coordenadores | **CONCLUÍDA** |
| **Wave 2** | Agendamento de Entrevistas + Lembretes WhatsApp | **CONCLUÍDA** |
| **Wave 4** | Automação (Bulk Invites, CRM Sync, Alertas) | PENDENTE |
| **Wave 5** | Mineração LLM + Ciclo de Qualidade | PENDENTE |

---

## Wave 1 — Dados Estruturados + Feedback de Rejeição ✅

**Objetivo:** Fundação de dados estruturados + melhoria imediata na qualidade do matching.

### O que foi implementado

#### Backend

| Arquivo | Mudança |
|---------|---------|
| `migrations/094_structured_rejection_and_priority.sql` | Coluna `rejection_reason_category` (8 enums EN), priority normalizado para URGENT/HIGH/NORMAL/LOW, `avg_quality_rating` em workers |
| `src/domain/entities/Encuadre.ts` | Type `RejectionReasonCategory` (DISTANCE, SCHEDULE_INCOMPATIBLE, INSUFFICIENT_EXPERIENCE, SALARY_EXPECTATION, WORKER_DECLINED, OVERQUALIFIED, DEPENDENCY_MISMATCH, OTHER) |
| `src/domain/entities/JobPosting.ts` | Type `JobPostingPriority` (URGENT, HIGH, NORMAL, LOW) |
| `src/infrastructure/repositories/EncuadreRepository.ts` | `rejection_reason_category` em upsert/bulkUpsert/mapRow/updateSupplement + novo método `getWorkerRejectionHistory()` |
| `src/infrastructure/services/MatchmakingService.ts` | Fase 2: penalidades por histórico de rejeição (-10 a -20 pts) + bônus por quality rating (+10 a +15 pts). Fase 3: histórico no prompt LLM |
| `src/application/use-cases/UpdateEncuadreResultUseCase.ts` | Atualiza resultado + recalcula avg_quality_rating do worker |
| `src/interfaces/controllers/VacanciesController.ts` | Método `updateEncuadreResult()` + validação de enums |
| `src/index.ts` | Rota `PUT /api/admin/encuadres/:id/result` |
| `src/infrastructure/scripts/import-planilhas.ts` | `normalizePriority()` retorna UPPERCASE EN |

#### Frontend

| Arquivo | Mudança |
|---------|---------|
| `src/domain/entities/Vacancy.ts` | Types `RejectionReasonCategory`, `JobPostingPriority` |
| `src/infrastructure/http/AdminApiService.ts` | Método `updateEncuadreResult()` |
| `src/presentation/components/features/admin/VacancyDetail/VacancyEncuadresCard.tsx` | Coluna "Motivo Rechazo" com dropdown inline para rejeitados + badges coloridos |
| `src/presentation/pages/admin/vacanciesData.ts` | Priority options normalizados (URGENT/HIGH/NORMAL/LOW) |
| `src/presentation/pages/admin/VacancyDetailPage.tsx` | Passa `onRefresh` ao VacancyEncuadresCard |
| `src/interfaces/controllers/VacanciesController.ts` | `getVacancyById` retorna `rejection_reason_category` e `rejection_reason` nos encuadres |

#### Testes

| Arquivo | Testes | Tipo |
|---------|--------|------|
| `UpdateEncuadreResultUseCase.test.ts` | 4 | Unit |
| `MatchmakingScoring.test.ts` | 13 | Unit |
| `encuadre-rejection.e2e.ts` | 5 | E2E Playwright |

---

## Wave 3 — Kanban de Encuadres + Dashboard Coordenadores ✅

**Objetivo:** Visualização centralizada do funil de encuadres por vaga + capacidade dos coordenadores.

### O que foi implementado

#### Backend

| Arquivo | Mudança |
|---------|---------|
| `src/interfaces/controllers/EncuadreFunnelController.ts` | 5 endpoints: funnel, move, coordinator-capacity, alerts, conversion-by-channel |
| `src/index.ts` | 5 rotas registradas sob `/api/admin/` |

**Endpoints criados:**

| Método | Rota | Função |
|--------|------|--------|
| GET | `/api/admin/vacancies/:id/funnel` | Encuadres agrupados por estágio (INVITED, CONFIRMED, INTERVIEWING, SELECTED, REJECTED, PENDING) |
| PUT | `/api/admin/encuadres/:id/move` | Move encuadre no kanban (atualiza resultado + rejection category) |
| GET | `/api/admin/dashboard/coordinator-capacity` | Métricas por coordenador (horas, casos, encuadres/semana, conversão) |
| GET | `/api/admin/dashboard/alerts` | Casos problemáticos (>200 encuadres, >30 dias, 0 candidatos 7d) |
| GET | `/api/admin/dashboard/conversion-by-channel` | Taxa de conversão por canal de origem (Facebook, Talentum, etc.) |

#### Frontend

| Arquivo | Mudança |
|---------|---------|
| `src/presentation/pages/admin/VacancyKanbanPage.tsx` | Página do kanban com 6 colunas e header com contagem |
| `src/presentation/components/features/admin/Kanban/KanbanBoard.tsx` | Board com DnD (@dnd-kit, closestCenter collision) |
| `src/presentation/components/features/admin/Kanban/KanbanColumn.tsx` | Coluna droppable com badge de contagem |
| `src/presentation/components/features/admin/Kanban/KanbanCard.tsx` | Card com nome, telefone, ocupação, zona, score, badge rejeição |
| `src/presentation/components/features/admin/Kanban/DraggableCard.tsx` | Wrapper draggable do @dnd-kit |
| `src/presentation/components/features/admin/Kanban/RejectionReasonSelect.tsx` | Modal obrigatório ao rejeitar (radio buttons + Confirmar) |
| `src/presentation/pages/admin/CoordinatorDashboardPage.tsx` | Dashboard com alertas, cards de coordenador, tabela conversão/canal |
| `src/hooks/admin/useEncuadreFunnel.ts` | Hook para funnel data + moveEncuadre |
| `src/hooks/admin/useCoordinatorDashboard.ts` | Hook para capacity + alerts + channels |
| `src/infrastructure/http/AdminApiService.ts` | Métodos: getEncuadreFunnel, moveEncuadre, getCoordinatorCapacity, getDashboardAlerts, getConversionByChannel |
| `src/presentation/App.tsx` | Rotas: `/admin/vacancies/:id/kanban`, `/admin/dashboard/coordinators` |
| `src/presentation/config/adminNavigation.tsx` | Item "Coordinadores" no sidebar |
| `src/presentation/pages/admin/VacancyDetailPage.tsx` | Botão "Kanban" ao lado de "Ver Match" |

#### Dependências adicionadas

| Pacote | Versão | Uso |
|--------|--------|-----|
| `@dnd-kit/core` | 6.3.1 | Drag-and-drop engine |
| `@dnd-kit/sortable` | 10.0.0 | Sortable presets |
| `@dnd-kit/utilities` | 3.2.2 | CSS transform utilities |

#### Testes

| Arquivo | Testes | Tipo |
|---------|--------|------|
| `EncuadreFunnelController.test.ts` | 7 | Unit |
| `vacancy-kanban.e2e.ts` | 10 | E2E Playwright |
| `coordinator-dashboard.e2e.ts` | 8 | E2E Playwright |

---

## Wave 2 — Agendamento de Entrevistas + Lembretes WhatsApp ✅

**Objetivo:** Coordenador define blocos fixos de horário + link Meet. Sistema convida, agenda e lembra automaticamente.

### O que foi implementado

#### Backend

| Arquivo | Mudança |
|---------|---------|
| `migrations/095_interview_slots_and_reminders.sql` | Tabela `interview_slots` (coordinator_id, job_posting_id, slot_date, slot_time, slot_end_time, meet_link, max_capacity, booked_count, status, notes) + trigger auto-status + constraint booked_count ≤ max_capacity + colunas em encuadres (interview_slot_id, reminder_day_sent_at, reminder_5min_sent_at) + 3 templates ES (encuadre_invitation, encuadre_reminder_day_before, encuadre_reminder_5min) |
| `src/domain/entities/InterviewSlot.ts` | Types `InterviewSlotStatus` (AVAILABLE, FULL, CANCELLED), `InterviewSlot`, `CreateInterviewSlotsDTO`, `BookSlotDTO`, `BookSlotResult` |
| `src/infrastructure/repositories/InterviewSlotRepository.ts` | `createSlots()` batch em transação, `getAvailableSlots()`, `getAllSlots()`, `getSlotById()`, `bookSlot()` com locking otimista (booked_count < max_capacity), `cancelSlot()` com limpeza de encuadres vinculados |
| `src/infrastructure/services/InterviewSchedulingService.ts` | `createSlotsForJob()` com validação de datas; `bookSlot()` → reserva slot + insere convite na messaging_outbox com TokenService para PII |
| `src/infrastructure/services/ReminderScheduler.ts` | Polling 60s: lembrete 24h antes + 5min antes, idempotente via reminder_*_sent_at, filtra slots cancelados e entrevistas passadas |
| `src/application/use-cases/ScheduleInterviewsUseCase.ts` | Validação de input + delegação para service, retorna Result<T> |
| `src/interfaces/controllers/InterviewSlotsController.ts` | 4 endpoints: createSlots, getSlots, bookSlot, cancelSlot |
| `src/index.ts` | 4 rotas + startup do ReminderScheduler |

**Endpoints criados:**

| Método | Rota | Função |
|--------|------|--------|
| POST | `/api/admin/vacancies/:id/interview-slots` | Cria slots em batch para a vaga |
| GET | `/api/admin/vacancies/:id/interview-slots` | Lista slots com summary (total/available/full/cancelled) |
| POST | `/api/admin/interview-slots/:slotId/book` | Reserva slot para encuadre + convite na outbox |
| DELETE | `/api/admin/interview-slots/:slotId` | Cancela slot e limpa referências nos encuadres |

#### Frontend

| Arquivo | Mudança |
|---------|---------|
| `src/domain/entities/InterviewSlot.ts` | Types `InterviewSlot`, `CreateSlotsInput`, `BookSlotResult`, `InterviewSlotsSummary` |
| `src/infrastructure/http/AdminApiService.ts` | Métodos: `createInterviewSlots`, `getInterviewSlots`, `bookInterviewSlot`, `cancelInterviewSlot` |
| `src/hooks/admin/useInterviewSlots.ts` | Hook com `slots`, `summary`, `isLoading`, `error`, `createSlots`, `bookSlot`, `cancelSlot`, `refetch` |
| `src/presentation/components/features/admin/VacancyMatch/ScheduleInterviewModal.tsx` | Modal em 2 fases: Fase 1 (formulário: data, hora, duração, quantidade, Meet link, capacidade → gera slots sequenciais) + Fase 2 (lista candidatos com select de slot + status por candidato) |
| `src/presentation/pages/admin/VacancyMatchPage.tsx` | Botão "Agendar Entrevista" (outline) ao lado de "Enviar para N selecionados", abre ScheduleInterviewModal |

#### Testes

| Arquivo | Testes | Tipo |
|---------|--------|------|
| `ScheduleInterviewsUseCase.test.ts` | 7 | Unit |
| `ReminderScheduler.test.ts` | 6 | Unit |
| `interview-scheduling.e2e.ts` | 9 | E2E Playwright |

#### Decisão de design
- **Meet Link:** Campo para colar manualmente (campo de texto). "Gerar Meet" via Google Calendar API fica para iteração futura.
- **encuadreId no booking:** Por ora usa `workerId` como proxy — backend resolve encuadre ativo. Será refinado quando match-results expuser `encuadreId` diretamente.

---

## Wave 4 — Automação (Bulk Invites, CRM Sync, Alertas) ⏳

**Objetivo:** Motor de automação que escala convites sem trabalho manual.

### O que precisa ser feito

#### Backend

- [ ] **Use Case** — `BulkInviteMatchedCandidatesUseCase.ts` (vagas BUSQUEDA/REEMPLAZO + top-N workers não convidados → outbox)
- [ ] **Service** — reabilitar `BulkDispatchScheduler.ts` com novo use case (diário 10h BRT)
- [ ] **Service** — `AlertMonitor.ts` (polling 6h: >200 encuadres sem sucesso, >30 dias aberto → n8n → Slack)
- [ ] **EventDispatcher.ts** — novos eventos: `encuadre.result.updated`, `alert.case.stuck`

#### N8N

- [ ] **Workflow** — `encuadre-events.json` (trigger: encuadre.result.updated → HubSpot sync + Slack)

#### Frontend

- [ ] **VacancyMatchPage.tsx** — botão "Convidar em Lote" com contagem de enviados

---

## Wave 5 — Mineração LLM + Ciclo de Qualidade ⏳

**Objetivo:** Extrair disponibilidade dos 9031 registros de obs_encuadre e integrar rating de qualidade no match.

### O que precisa ser feito

#### Backend

- [ ] **Migration 096** — coluna `availability_mined_at` em encuadres
- [ ] **Migration 097** — trigger que recalcula `workers.avg_quality_rating` a cada INSERT/UPDATE em `worker_placement_audits`
- [ ] **Service** — `AvailabilityMiningService.ts` (LLM parseia "Lunes a viernes de 8 a 14" → upsert em worker_availability, batch 50, rate-limited)
- [ ] **Use Case** — `MineAvailabilityUseCase.ts`
- [ ] **MatchmakingService.ts** — bônus por avg_quality_rating (já implementado na Wave 1, trigger falta)

#### Frontend

- [ ] **WorkerDetailPage.tsx** — rota `/admin/workers/:id` com rating (estrelas), histórico de encuadres, heatmap de disponibilidade
- [ ] **QualityCard.tsx** — card de auditorias + formulário de review
- [ ] **useWorkerDetail.ts** — hook

---

## Infraestrutura já existente (reutilizada, não reconstruir)

| Componente | Arquivo | Papel no sistema |
|------------|---------|------------------|
| MatchmakingService | `worker-functions/src/infrastructure/services/MatchmakingService.ts` | Match 3 fases (SQL + Score + LLM). Já inclui penalidade por rejeição + bônus quality (Wave 1) |
| OutboxProcessor | `worker-functions/src/infrastructure/services/OutboxProcessor.ts` | Polling 30s, envia WhatsApp via Twilio |
| TwilioMessagingService | `worker-functions/src/infrastructure/services/TwilioMessagingService.ts` | Envio WhatsApp com content SID templates |
| BulkDispatchScheduler | `worker-functions/src/infrastructure/services/BulkDispatchScheduler.ts` | Disparo diário (desabilitado, Wave 4 reabilita) |
| EventDispatcher | `worker-functions/src/infrastructure/services/EventDispatcher.ts` | Webhook para n8n |
| GeocodingService | `worker-functions/src/infrastructure/services/GeocodingService.ts` | Google Maps geocoding |
| KMSEncryptionService | `worker-functions/src/infrastructure/security/KMSEncryptionService.ts` | Encrypta/decrypta PII |
| worker_placement_audits | Migration 043 | Tabela de auditoria com rating 1-5 (já populada via import) |
| worker_availability | Migration 001 | Disponibilidade por dia/horário |
| worker_service_areas | Migration 001 | Localização geográfica (lat/lng, raio) |
| coordinator_weekly_schedules | Migration 044 | Horas semanais por coordenador |
| coordinators | Migration 072 | Entidade coordenador com FK em 4 tabelas |

---

## Cobertura de Testes

### Testes Unitários (37 passando)

| Suite | Testes | Cobertura |
|-------|--------|-----------|
| `UpdateEncuadreResultUseCase.test.ts` | 4 | Update resultado, recalc rating, sem worker, not found |
| `EncuadreFunnelController.test.ts` | 7 | Funnel grouping, move, capacity, alerts |
| `MatchmakingScoring.test.ts` | 13 | Penalidades por rejeição (todos os tiers + stacking) + bônus quality (todos os tiers + null) |
| `ScheduleInterviewsUseCase.test.ts` | 7 | Validação DTO, criação slots, bookSlot sem IDs |
| `ReminderScheduler.test.ts` | 6 | Lifecycle timer, lembrete 24h, lembrete 5min, idempotência, slots cancelados |

### Testes E2E Playwright (32 passando)

| Suite | Testes | Cobertura |
|-------|--------|-----------|
| `encuadre-rejection.e2e.ts` | 5 | Dropdown rejeição, badges, SELECCIONADO sem dropdown, 8 opções, PUT ao backend |
| `vacancy-kanban.e2e.ts` | 10 | 6 colunas, cards com dados, badges, navegação, DnD attributes, move endpoint, botão Actualizar |
| `coordinator-dashboard.e2e.ts` | 8 | Sidebar nav, coordinator cards, alertas, click→kanban, conversão por canal |
| `interview-scheduling.e2e.ts` | 9 | Botão hidden sem seleção, modal fases 1+2, POST create slots, POST book slot, slot lotado, Listo fecha modal, X fecha modal |

---

## Ordem de Execução

```
Wave 1 (DONE) → Wave 3 (DONE) → Wave 2 (DONE) → Wave 4 (NEXT) → Wave 5
```

Waves 2, 4 e 5 são independentes entre si após Wave 1+3 concluídas.
Wave 4 depende de Wave 2 (templates de convite para bulk dispatch).
