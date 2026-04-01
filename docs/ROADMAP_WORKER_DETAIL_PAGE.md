# Roadmap: Tela de Detalhes do Worker (Admin)

> Status: **Concluído**
> Criado em: 2026-03-31
> Concluído em: 2026-04-01

---

## Objetivo

Permitir que o admin clique em um worker na listagem (`/admin/workers`) e veja uma pagina de detalhes completa (`/admin/workers/:id`) com todas as informacoes relevantes: dados pessoais, profissionais, documentos, localizacao e historico de encuadres (casos).

---

## Layout da Tela

```
[Header: Breadcrumb "Workers > Nome do Worker" + badges matchable/active]

Row 1: [StatusCard]           [PersonalCard]
Row 2: [ProfessionalCard]     [LocationCard]
Row 3 (full-width): [DocumentsCard]
Row 4 (full-width): [EncuadresCard (casos)]
```

Padrao visual: identico ao VacancyDetailPage (bg-[#FFF9FC], cards bg-white rounded-2xl border shadow-sm p-6, grid 2 colunas).

---

## Gaps Identificados

| Gap | Detalhe |
|-----|---------|
| `worker_availability` dropada | Migration 028 removeu a tabela. Sem secao de horarios na V1 |
| `worker_payment_info` inexistente | Tabela nunca criada. Sem card de pagamento |
| `current_step` / `registration_completed` removidos | Migration 028 dropou essas colunas |
| Sem endpoint de detalhe | `GET /api/admin/workers/:id` nao existe — precisa ser criado |
| 16 campos PII criptografados | Decrypt em paralelo via KMS no endpoint |

---

## Tasks

### Task 1: Backend — Endpoint GET /api/admin/workers/:id

**Status:** [ ] Pendente
**Escopo:** Backend (worker-functions)

**Descricao:** Criar metodo `getWorkerById()` no `AdminWorkersController` e registrar rota.

**O metodo deve:**
- Buscar worker por ID na tabela `workers` (com `WHERE merged_into_id IS NULL`)
- Descriptografar 16 campos PII em paralelo via `KMSEncryptionService`
- Buscar dados relacionados em paralelo: `worker_documents`, `worker_service_areas`, `worker_locations`, `encuadres`
- Consultar a view `worker_eligibility` para `is_matchable` e `is_active`
- Retornar 404 se worker nao encontrado

**Arquivos:**
- `worker-functions/src/interfaces/controllers/AdminWorkersController.ts` — adicionar `getWorkerById()`
- `worker-functions/src/index.ts` — registrar rota (ANTES de `/api/admin/workers/stats` para evitar conflito)

**Contrato da API (response):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "string",
    "phone": "string | null",
    "whatsappPhone": "string | null",
    "country": "string",
    "timezone": "string",
    "status": "REGISTERED | INCOMPLETE_REGISTER | DISABLED",
    "overallStatus": "QUALIFIED | ACTIVE | HIRED | ...",
    "availabilityStatus": "string | null",
    "dataSources": ["string"],
    "platform": "string",
    "createdAt": "ISO string",
    "updatedAt": "ISO string",

    "firstName": "string | null",
    "lastName": "string | null",
    "sex": "string | null",
    "gender": "string | null",
    "birthDate": "ISO date | null",
    "documentType": "string | null",
    "documentNumber": "string | null",
    "profilePhotoUrl": "string | null",

    "profession": "string | null",
    "occupation": "string | null",
    "knowledgeLevel": "string | null",
    "titleCertificate": "string | null",
    "experienceTypes": ["string"],
    "yearsExperience": "string | null",
    "preferredTypes": ["string"],
    "preferredAgeRange": "string | null",
    "languages": ["string"],

    "sexualOrientation": "string | null",
    "race": "string | null",
    "religion": "string | null",
    "weightKg": "string | null",
    "heightCm": "string | null",
    "hobbies": ["string"],
    "diagnosticPreferences": ["string"],
    "linkedinUrl": "string | null",

    "isMatchable": "boolean",
    "isActive": "boolean",

    "documents": {
      "id": "string",
      "resumeCvUrl": "string | null",
      "identityDocumentUrl": "string | null",
      "criminalRecordUrl": "string | null",
      "professionalRegistrationUrl": "string | null",
      "liabilityInsuranceUrl": "string | null",
      "additionalCertificatesUrls": ["string"],
      "documentsStatus": "pending | incomplete | submitted | under_review | approved | rejected",
      "reviewNotes": "string | null",
      "reviewedBy": "string | null",
      "reviewedAt": "ISO string | null",
      "submittedAt": "ISO string | null"
    },

    "serviceAreas": [
      {
        "id": "string",
        "address": "string",
        "addressComplement": "string | null",
        "serviceRadiusKm": "number",
        "lat": "number",
        "lng": "number"
      }
    ],

    "location": {
      "address": "string | null",
      "city": "string | null",
      "workZone": "string | null",
      "interestZone": "string | null"
    },

    "encuadres": [
      {
        "id": "string",
        "jobPostingId": "string | null",
        "caseNumber": "string | null",
        "patientName": "string | null",
        "resultado": "SELECCIONADO | RECHAZADO | PENDIENTE | ...",
        "interviewDate": "string | null",
        "interviewTime": "string | null",
        "recruiterName": "string | null",
        "coordinatorName": "string | null",
        "rejectionReason": "string | null",
        "rejectionReasonCategory": "string | null",
        "attended": "boolean | null",
        "createdAt": "ISO string"
      }
    ]
  }
}
```

**Criterios de aceite:**
- [x] GET `/api/admin/workers/{uuid}` retorna 200 com dados completos
- [x] GET `/api/admin/workers/{uuid-inexistente}` retorna 404
- [x] GET `/api/admin/workers/stats` continua funcionando
- [x] Campos PII descriptografados
- [x] Requer `authMiddleware.requireAdmin()`
- [x] Arquivo nao ultrapassa 400 linhas

---

### Task 2: Backend — Teste E2E do endpoint

**Status:** [ ] Pendente
**Escopo:** Backend (worker-functions)
**Depende de:** Task 1

**Arquivos:**
- `worker-functions/tests/e2e/admin-worker-detail.test.ts` (novo)

**Criterios de aceite:**
- [ ] Testa 200 com worker existente (verifica shape do response)
- [ ] Testa 404 com UUID inexistente
- [ ] Testa 401 sem autenticacao
- [ ] Testa que campos PII estao descriptografados

---

### Task 3: Frontend — Entidade WorkerDetail + AdminApiService

**Status:** [ ] Pendente
**Escopo:** Frontend (enlite-frontend)
**Depende de:** Task 1 (contrato da API)

**Arquivos:**
- `enlite-frontend/src/domain/entities/Worker.ts` — adicionar interface `WorkerDetail` e sub-interfaces
- `enlite-frontend/src/infrastructure/http/AdminApiService.ts` — adicionar `getWorkerById(id: string)`

**Criterios de aceite:**
- [ ] Interface tipada conforme contrato da API
- [ ] Metodo usa `this.request<WorkerDetail>('GET', ...)` (padrao existente)
- [ ] Nenhum tipo `any`

---

### Task 4: Frontend — Hook useWorkerDetail

**Status:** [ ] Pendente
**Escopo:** Frontend (enlite-frontend)
**Depende de:** Task 3

**Arquivos:**
- `enlite-frontend/src/hooks/admin/useWorkerDetail.ts` (novo)

**Padrao:** Seguir `useVacancyDetail.ts` (useEffect + cancelled flag + AbortController).

**Criterios de aceite:**
- [ ] Aceita `workerId: string | undefined`
- [ ] Retorna `{ worker, isLoading, error, refetch }`
- [ ] Nao dispara request se `workerId` e undefined

---

### Task 5: Frontend — WorkerDetailPage + Cards

**Status:** [ ] Pendente
**Escopo:** Frontend (enlite-frontend)
**Depende de:** Task 4

**Arquivos (todos novos):**
- `enlite-frontend/src/presentation/pages/admin/WorkerDetailPage.tsx`
- `enlite-frontend/src/presentation/components/features/admin/WorkerDetail/WorkerStatusCard.tsx`
- `enlite-frontend/src/presentation/components/features/admin/WorkerDetail/WorkerPersonalCard.tsx`
- `enlite-frontend/src/presentation/components/features/admin/WorkerDetail/WorkerProfessionalCard.tsx`
- `enlite-frontend/src/presentation/components/features/admin/WorkerDetail/WorkerLocationCard.tsx`
- `enlite-frontend/src/presentation/components/features/admin/WorkerDetail/WorkerDocumentsCard.tsx`
- `enlite-frontend/src/presentation/components/features/admin/WorkerDetail/WorkerEncuadresCard.tsx`

**Conteudo dos cards:**

| Card | Campos |
|------|--------|
| StatusCard | status, overallStatus, isMatchable, isActive, dataSources, platform, createdAt, updatedAt |
| PersonalCard | nome, email, telefone, whatsapp, foto, nascimento, documento, sexo, genero |
| ProfessionalCard | profissao, nivel, certificado, idiomas, experiencia, preferencias, linkedin |
| LocationCard | service areas (endereco, raio) + worker_locations (work_zone, interest_zone) |
| DocumentsCard | tabela de documentos com status badge, links para download, notas de revisao |
| EncuadresCard | tabela de encuadres com resultado, data, caso, link para vaga |

**Criterios de aceite:**
- [ ] Padrao visual identico ao VacancyDetailPage
- [ ] Header com botao voltar → `/admin/workers`
- [ ] Loading state usa DetailSkeleton
- [ ] Error state com mensagem e botao voltar
- [ ] Campos vazios/null exibem "--"
- [ ] Encuadres clicaveis → `/admin/vacancies/:jobPostingId`
- [ ] Badges de documentos: verde (approved), amarelo (under_review), vermelho (rejected), cinza (pending)
- [ ] Badges de eligibilidade: verde "Matchable" / vermelho "Nao matchable"
- [ ] Responsivo (mobile + desktop)
- [ ] Nenhum arquivo > 400 linhas

---

### Task 6: Frontend — Rota e navegacao

**Status:** [ ] Pendente
**Escopo:** Frontend (enlite-frontend)
**Depende de:** Task 5

**Arquivos:**
- `enlite-frontend/src/presentation/App.tsx` — adicionar `<Route path="workers/:id" element={<WorkerDetailPage />} />`
- `enlite-frontend/src/presentation/pages/admin/AdminWorkersPage.tsx` — conectar `onRowClick` com `navigate`

**Criterios de aceite:**
- [ ] Rota `/admin/workers/:id` renderiza WorkerDetailPage dentro de AdminLayout
- [ ] Click em linha da tabela navega para `/admin/workers/{id}`
- [ ] Cursor pointer nas linhas (ja implementado via onRowClick)
- [ ] Rota protegida por AdminProtectedRoute

---

### Task 7: Frontend — i18n (pt-BR + es)

**Status:** [x] Concluída
**Escopo:** Frontend (enlite-frontend)
**Depende de:** Task 5

**Arquivos:**
- `enlite-frontend/src/infrastructure/i18n/locales/pt-BR.json`
- `enlite-frontend/src/infrastructure/i18n/locales/es.json`

**Namespace:** `admin.workerDetail.*`

**Criterios de aceite:**
- [x] Todos os labels traduzidos (titulos, campos, status)
- [x] PT-BR e ES completos

---

### Task 8: Frontend — Testes unitarios

**Status:** [x] Concluída
**Escopo:** Frontend (enlite-frontend)
**Depende de:** Tasks 4, 5

**Arquivos:**
- `enlite-frontend/src/hooks/admin/__tests__/useWorkerDetail.test.ts` (novo)
- `enlite-frontend/src/presentation/pages/admin/__tests__/WorkerDetailPage.test.tsx` (novo)

**Criterios de aceite:**
- [x] Hook: loading, success, error, refetch
- [x] Page: renderiza loading, dados, erro, navegacao voltar
- [x] Mock do AdminApiService

---

## Sequencia de Execucao

```
Task 1 (Backend: endpoint) ──► Task 2 (Backend: teste E2E)
         │
         ▼
Task 3 (Frontend: entidade + API) ──► Task 4 (Frontend: hook)
                                              │
                                              ▼
                                     Task 5 (Frontend: page + cards)
                                              │
                                    ┌─────────┼─────────┐
                                    ▼         ▼         ▼
                              Task 6       Task 7    Task 8
                           (rota/nav)     (i18n)     (testes)
```

Tasks 6, 7 e 8 podem ser paralelizadas apos Task 5.

---

## Riscos

| Risco | Mitigacao |
|-------|-----------|
| Performance KMS decrypt (16 campos) | Usar `Promise.all()` para decrypt em paralelo (~50-100ms) |
| AdminWorkersController perto de 400 linhas | Atual: ~188 linhas. Com novo metodo: ~340. Se ultrapassar, extrair mapeamento |
| Conflito de rota `/stats` vs `/:id` | Registrar `/stats` ANTES de `/:id` no router |
| `worker_availability` e codigo morto | NAO usar. AvailabilityRepository esta obsoleto |
| Encuadre com `patient_name` (dado sensivel) | Aceitavel para admin. Rota protegida por `requireAdmin()` |

---

## Checklist QA Final

- [ ] `GET /api/admin/workers/:id` retorna 200 com todos os campos
- [ ] `GET /api/admin/workers/:id` retorna 404 para UUID inexistente
- [ ] `GET /api/admin/workers/stats` nao quebrou
- [ ] Campos PII descriptografados corretamente
- [ ] Click na tabela navega para `/admin/workers/:id`
- [ ] Pagina renderiza com dados completos
- [ ] Pagina renderiza com dados parciais (worker importado)
- [ ] Loading state (skeleton) funciona
- [ ] Error state com botao voltar funciona
- [ ] Click em encuadre navega para `/admin/vacancies/:id`
- [ ] Responsivo (mobile + desktop)
- [ ] Nenhum arquivo > 400 linhas
- [ ] Clean Architecture respeitada
- [ ] `pnpm type-check` passa
- [ ] `pnpm lint` passa
- [ ] `pnpm validate:architecture` passa
- [ ] Testes unitarios passam
- [ ] Teste E2E passa
- [ ] i18n PT-BR e ES completos
