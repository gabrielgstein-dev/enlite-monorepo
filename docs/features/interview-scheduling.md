# Entrevistas & Agendamento (INT)

## O que e

Sistema de agendamento de entrevistas com slots de horario, integracao Google Meet e booking de candidatos. Admins criam slots disponiveis para uma vaga, agendam candidatos nos slots e o sistema envia convites automaticos via WhatsApp.

## Por que existe

Coordenadores gerenciam dezenas de entrevistas por semana. O agendamento manual por WhatsApp/planilha era propenso a conflitos de horario e falta de rastreabilidade. O sistema centraliza a criacao de slots, booking e notificacoes.

## Como funciona

### Fluxo de agendamento

```
Admin cria slots para vaga
  |  POST /api/admin/vacancies/:id/interview-slots
  |  date, startTime, endTime, coordinatorId, meetLink, notes
  v
Slots ficam AVAILABLE
  |
  v
Admin agenda candidato em slot
  |  POST /api/admin/interview-slots/:slotId/book
  |  encuadre_id, sendInvitation (default true)
  v
Slot status: AVAILABLE -> FULL (se capacidade atingida)
  |  Se sendInvitation=true, envia WhatsApp
  v
Lembretes automaticos
  |  24h antes: POST /api/internal/reminders/qualified
  |  5min antes: POST /api/internal/reminders/5min
  v
Entrevista acontece via Google Meet
```

### Google Meet Links

```
Admin adiciona ate 3 links Meet por vaga
  |  PUT /api/admin/vacancies/:id/meet-links
  |  { meetLink1, meetLink2, meetLink3 }
  v
Sistema valida formato (meet.google.com/...)
  |  Resolve datetime de cada link via Google Calendar API (paralelo)
  v
Salva: meet_link_1..3 + meet_datetime_1..3
  |  Falha silenciosa na resolucao de datetime (retorna null)
```

## Endpoints

| Metodo | Rota | Funcao |
|--------|------|--------|
| POST | `/api/admin/vacancies/:id/interview-slots` | Criar slots |
| GET | `/api/admin/vacancies/:id/interview-slots` | Listar slots (filtro por status) |
| POST | `/api/admin/interview-slots/:slotId/book` | Agendar candidato |
| DELETE | `/api/admin/interview-slots/:slotId` | Cancelar slot |
| PUT | `/api/admin/vacancies/:id/meet-links` | Salvar links Google Meet |
| POST | `/api/internal/reminders/qualified` | Trigger lembrete 24h |
| POST | `/api/internal/reminders/5min` | Trigger lembrete 5min |

## Componentes

### Backend

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/interfaces/controllers/InterviewSlotsController.ts` | CRUD slots + booking |
| `src/interfaces/controllers/VacancyMeetLinksController.ts` | Gestao Meet links |
| `src/interfaces/controllers/InternalController.ts` | Triggers de lembrete |
| `src/application/use-cases/ScheduleInterviewsUseCase.ts` | Logica de agendamento |
| `src/infrastructure/services/InterviewSchedulingService.ts` | Gerenciamento de slots (optimistic locking) |
| `src/infrastructure/services/ReminderScheduler.ts` | Lembretes 24h e 5min |
| `src/infrastructure/services/GoogleCalendarService.ts` | Resolucao de datetime |
| `src/infrastructure/repositories/InterviewSlotRepository.ts` | Persistencia slots |
| `src/domain/entities/InterviewSlot.ts` | Entidade slot |

### Frontend

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/presentation/components/features/admin/VacancyMatch/ScheduleInterviewModal.tsx` | Modal de agendamento (2 fases) |
| `src/presentation/components/features/admin/VacancyDetail/VacancyMeetLinksCard.tsx` | Card de Meet links |
| `src/hooks/admin/useInterviewSlots.ts` | Hook de slots |

## Regras de negocio

- **Status do slot**: AVAILABLE, FULL, CANCELLED
- **Campos obrigatorios**: date, startTime, endTime
- **Campos opcionais**: coordinatorId, meetLink, notes
- **Booking**: Vincula encuadre_id ao slot; muda status para FULL se capacidade atingida
- **Convite automatico**: Booking dispara envio de convite WhatsApp (salvo `sendInvitation=false`)
- **Optimistic locking**: InterviewSchedulingService usa locking otimista para evitar double-booking
- **Meet links**: Maximo 3 por vaga, validacao de formato `meet.google.com/...`
- **Resolucao de datetime**: Paralela, falha silenciosa (nao bloqueia salvamento)
- **Lembretes**: Disparados via Cloud Tasks; enviam WhatsApp com data, hora, meet link e contato do coordenador

## Integracoes externas

- **Google Calendar API**: Resolucao de datetime de eventos Meet
- **Cloud Tasks**: Agendamento de lembretes (24h e 5min antes)
- **Twilio/WhatsApp**: Envio de convites e lembretes
