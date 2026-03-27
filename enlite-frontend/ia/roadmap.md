# Roadmap - Sistema de Workers

Roadmap completo do sistema de cadastro, documentação e candidatura de workers.

---

## 📊 Status Geral

| Fase | Status | Progresso |
|------|--------|-----------|
| **Fase 1: Registro Inicial** | 🟡 Em Progresso | 60% |
| **Fase 2: Upload de Documentos** | 🟡 Em Progresso | 60% |
| **Fase 3: Sistema de Vagas** | ⚪ Não Iniciado | 0% |
| **Fase 4: Sistema de Candidaturas** | ⚪ Não Iniciado | 0% |
| **Fase 5: Sistema de Match** | ⚪ Não Iniciado | 0% |
| **Fase 6: Dados Financeiros** | ⚪ Não Iniciado | 0% |

---

## 🎯 FASE 1: Registro Inicial (3 Steps)

### ✅ Concluído

- [x] Estrutura de 3 steps (General Info, Service Address, Availability)
- [x] Store Zustand com persistência
- [x] Navegação entre steps
- [x] Backend: tabelas `workers`, `worker_service_areas`, `worker_availability`
- [x] Backend: endpoints `/api/workers/init`, `/api/workers/me`, `/api/workers/step`
- [x] Migrations 001-007 aplicadas

### ✅ CONCLUÍDO - Todos os Campos do Step 1 Conectados

**Implementado:**
- ✅ Todos os 11 campos desconectados agora estão conectados com `{...register()}`
- ✅ Interface `GeneralInfoData` atualizada com todos os campos
- ✅ Schema Zod `generalInfoSchema` atualizado com validação completa
- ✅ Payload do `saveStep` corrigido para enviar todos os 20 campos ao backend
- ✅ Store inicializado com valores padrão para todos os campos

### ✅ CONCLUÍDO - Testes Unitários e E2E Completos

**Testes Unitários:**
- ✅ `workerRegistrationSchemas.test.ts` - Validação de todos os schemas Zod
- ✅ `workerRegistrationSchemas.newFields.test.ts` - 11 novos campos testados individualmente:
  - ✅ lastName (obrigatório)
  - ✅ sex (Masculino/Feminino)
  - ✅ gender (Masculino/Feminino/Outro)
  - ✅ documentType (CPF/RG/CNH)
  - ✅ languages (array, mínimo 1)
  - ✅ profession (obrigatório)
  - ✅ knowledgeLevel (obrigatório)
  - ✅ experienceTypes (array, mínimo 1)
  - ✅ yearsExperience (obrigatório)
  - ✅ preferredTypes (array, mínimo 1)
  - ✅ preferredAgeRange (obrigatório)

**Testes E2E (Playwright):**
- ✅ `worker-registration.e2e.ts` - Fluxo completo de registro:
  - ✅ Preenchimento de todos os 18 campos do Step 1
  - ✅ Preenchimento do Step 2 (Service Address)
  - ✅ Preenchimento do Step 3 (Availability)
  - ✅ Validação de campos obrigatórios
  - ✅ Validação de formato de email
  - ✅ Validação de CPF
  - ✅ Validação de telefone
  - ✅ Persistência de dados entre steps
  - ✅ Verificação de payload enviado ao backend (20 campos)

**Scripts de Teste:**
- ✅ `pnpm test` - Testes unitários (vitest)
- ✅ `pnpm test:run` - Testes unitários (CI mode)
- ✅ `pnpm test:coverage` - Cobertura de testes
- ✅ `pnpm test:e2e` - Testes E2E (Playwright)
- ✅ `pnpm test:e2e:ui` - Testes E2E com UI
- ✅ `pnpm test:all` - Todos os testes (unit + E2E)

### 🟡 Melhorias Necessárias

- [ ] Adicionar campo `acceptsRemoteService` ao banco de dados (atualmente apenas UI)
- [ ] Integração com Google Maps para lat/lng (atualmente hardcoded como 0)
- [ ] Melhorar feedback de erros de validação
- [ ] Adicionar loading states mais robustos

---

## 🎯 FASE 2: Upload de Documentos

### ✅ Backend - Migrations e Entidades - CONCLUÍDO

- [x] Migration 008: Campos demográficos estendidos
- [x] Migration 009: Tabela `worker_documents`
- [x] Entity: `WorkerDocuments.ts`
- [x] Repository: `WorkerDocumentsRepository.ts`
- [x] Use Case: `UploadWorkerDocumentsUseCase.ts`
- [x] Use Case: `ReviewWorkerDocumentsUseCase.ts`
- [x] Controller: `WorkerDocumentsController.ts`
- [x] Endpoints implementados:
  - [x] `POST /api/workers/:id/documents` - Upload de documentos
  - [x] `GET /api/workers/:id/documents` - Buscar documentos
  - [x] `PUT /api/workers/:id/documents/review` - Admin revisar documentos

### 🟡 Frontend - Tela de Upload

**Aba `DocumentsTab` na tela de Perfil do Worker**

- [x] Criar aba `Documentos` em `WorkerProfilePage` (após Disponibilidade)
- [x] Implementar upload de 5 documentos obrigatórios:
  1. [x] Currículo em PDF
  2. [x] DNI/RG/CPF em PDF
  3. [x] Antecedentes penais em PDF
  4. [x] Registro profissional (AFIP/CRM/COREN) em PDF
  5. [x] Seguro de responsabilidade civil em PDF
- [ ] Implementar upload de certificados adicionais (opcional)
- [x] Integração com GCS via signed URLs (upload direto)
- [x] Validação de tipo de arquivo (apenas PDF)
- [x] Validação de tamanho de arquivo (max 10MB por arquivo)
- [ ] Preview de PDFs antes do envio
- [x] Indicador de loading por card durante upload
- [x] Feedback de erro por card
- [x] Bordas azuis + ícone X (remover) + ícone olho (visualizar) quando uploaded

**Backend - GCS e endpoints /me:**
- [x] `GCSStorageService` — signed URLs para upload (PUT) e visualização (GET), delete
- [x] `WorkerDocumentsMeController` — 5 endpoints autenticados:
  - [x] `GET /api/workers/me/documents`
  - [x] `POST /api/workers/me/documents/upload-url`
  - [x] `POST /api/workers/me/documents/save`
  - [x] `POST /api/workers/me/documents/view-url`
  - [x] `DELETE /api/workers/me/documents/:type`
- [x] `clearDocumentField` no `WorkerDocumentsRepository`

**Campos Demográficos Estendidos (mesma tela):**

- [ ] Select `sexualOrientation`
- [ ] Select `race`
- [ ] Select `religion`
- [ ] Input `weight` (kg)
- [ ] Input `height` (cm)
- [ ] Multi-select `hobbies`
- [ ] Multi-select `diagnosticPreferences`
- [ ] Input `linkedinUrl`

**Fluxo:**
```
Worker completa Step 3 (Availability)
  ↓
Redireciona para /worker/documents
  ↓
Preenche campos demográficos + Upload de 5 PDFs
  ↓
Clica "Enviar Documentos"
  ↓
Status muda para 'submitted'
  ↓
Tela de confirmação: "Entraremos em contato"
```

### ⚪ Admin - Tela de Revisão

**Componente: `AdminDocumentsReviewPage.tsx`**

- [ ] Listar workers com `documents_status = 'submitted'`
- [ ] Visualizar PDFs enviados
- [ ] Botões: Aprovar / Rejeitar
- [ ] Campo de feedback (obrigatório se rejeitar)
- [ ] Atualizar `documents_status` para 'approved' ou 'rejected'

---

## 🎯 FASE 3: Sistema de Vagas

### ⚪ Backend

- [x] Migration 011: Tabela `job_postings`
- [x] Entity: `JobPosting.ts`
- [ ] Repository: `JobPostingRepository.ts`
- [ ] Use Case: `CreateJobPostingUseCase.ts`
- [ ] Use Case: `ListJobPostingsUseCase.ts`
- [ ] Use Case: `UpdateJobPostingUseCase.ts`
- [ ] Controller: `JobPostingController.ts`
- [ ] Endpoints:
  - [ ] `POST /api/jobs` - Criar vaga (admin)
  - [ ] `GET /api/jobs` - Listar vagas ativas
  - [ ] `GET /api/jobs/:id` - Detalhes da vaga
  - [ ] `PUT /api/jobs/:id` - Atualizar vaga (admin)
  - [ ] `DELETE /api/jobs/:id` - Deletar vaga (admin)

### ⚪ Frontend - Admin

**Componente: `AdminJobPostingsPage.tsx`**

- [ ] Listar todas as vagas
- [ ] Filtros: status, país, profissão
- [ ] Botão "Criar Nova Vaga"
- [ ] Editar vaga existente
- [ ] Mudar status (draft → active → paused → closed)

**Componente: `AdminCreateJobPage.tsx`**

- [ ] Formulário de criação de vaga
- [ ] Campos:
  - [ ] Título
  - [ ] Descrição
  - [ ] Profissão requerida
  - [ ] Anos de experiência
  - [ ] Idiomas requeridos
  - [ ] Faixa etária preferida
  - [ ] Localização (cidade, estado, país)
  - [ ] Remoto (sim/não)
  - [ ] Faixa salarial
  - [ ] Tipo de contrato (full-time/part-time/flexible)
  - [ ] Máximo de candidatos

### ⚪ Frontend - Worker

**Componente: `JobListingsPage.tsx`**

- [ ] Listar vagas ativas
- [ ] Filtros: profissão, localização, remoto
- [ ] Card de vaga com informações principais
- [ ] Botão "Ver Detalhes"
- [ ] Badge de "Match Score" (futuro)

**Componente: `JobDetailsPage.tsx`**

- [ ] Detalhes completos da vaga
- [ ] Botão "Candidatar-se"
- [ ] Guard: só mostra botão se `documents_status = 'approved'`
- [ ] Se documentos não aprovados: mensagem + link para upload

---

## 🎯 FASE 4: Sistema de Candidaturas

### ⚪ Backend

- [x] Migration 011: Tabela `worker_job_applications`
- [x] Entity: `WorkerJobApplication.ts`
- [ ] Repository: `WorkerJobApplicationRepository.ts`
- [ ] Use Case: `CreateJobApplicationUseCase.ts`
- [ ] Use Case: `ListWorkerApplicationsUseCase.ts`
- [ ] Use Case: `UpdateApplicationStatusUseCase.ts`
- [ ] Controller: `JobApplicationController.ts`
- [ ] Endpoints:
  - [ ] `POST /api/jobs/:id/apply` - Worker se candidata
  - [ ] `GET /api/workers/:id/applications` - Listar candidaturas do worker
  - [ ] `GET /api/jobs/:id/applications` - Listar candidatos da vaga (admin)
  - [ ] `PUT /api/applications/:id/status` - Atualizar status (admin)
  - [ ] `DELETE /api/applications/:id` - Worker desiste da candidatura

### ⚪ Frontend - Worker

**Guard: `JobApplicationGuard.tsx`**

- [ ] Verificar se `documents_status = 'approved'`
- [ ] Se não aprovado: redirecionar para tela de documentos
- [ ] Se aprovado: permitir candidatura

**Componente: `JobApplicationPage.tsx`**

- [ ] Resumo da vaga
- [ ] Campo opcional: carta de apresentação
- [ ] Botão "Confirmar Candidatura"
- [ ] Verificação: worker já se candidatou a esta vaga?
- [ ] Tela de sucesso: "Candidatura enviada com sucesso"

**Componente: `MyApplicationsPage.tsx`**

- [ ] Listar todas as candidaturas do worker
- [ ] Status de cada candidatura
- [ ] Filtros: status (applied, under_review, approved, rejected)
- [ ] Botão "Desistir" (se status = applied ou under_review)

### ⚪ Frontend - Admin

**Componente: `AdminJobApplicationsPage.tsx`**

- [ ] Listar candidatos de uma vaga específica
- [ ] Ordenar por match score (futuro)
- [ ] Ver perfil do worker
- [ ] Ver documentos do worker
- [ ] Atualizar status:
  - [ ] Under Review
  - [ ] Shortlisted
  - [ ] Interview Scheduled
  - [ ] Approved
  - [ ] Rejected
  - [ ] Hired
- [ ] Campo de notas internas
- [ ] Campo de motivo de rejeição (obrigatório se rejeitar)

---

## 🎯 FASE 5: Sistema de Match (Futuro)

### ⚪ Backend

- [ ] Use Case: `CalculateMatchScoreUseCase.ts`
- [ ] Algoritmo de matching baseado em:
  - [ ] Profissão (worker vs vaga)
  - [ ] Anos de experiência
  - [ ] Idiomas
  - [ ] Localização (distância)
  - [ ] Faixa etária preferida
  - [ ] Disponibilidade de horários
- [ ] Endpoint: `GET /api/jobs/:id/matches` - Workers com melhor match
- [ ] Endpoint: `GET /api/workers/:id/matches` - Vagas com melhor match
- [ ] Job assíncrono: recalcular scores quando vaga é criada/atualizada

### ⚪ Frontend

- [ ] Badge de match score em cards de vagas
- [ ] Ordenar vagas por match score
- [ ] Explicação do match (por que esse score?)
- [ ] Notificações de novas vagas com alto match

---

## 🎯 FASE 6: Dados Financeiros

### ⚪ Backend

- [x] Migration 010: Tabela `worker_payment_info`
- [x] Entity: `WorkerPaymentInfo.ts`
- [ ] Repository: `WorkerPaymentInfoRepository.ts`
- [ ] Use Case: `CreateWorkerPaymentInfoUseCase.ts`
- [ ] Use Case: `VerifyWorkerPaymentInfoUseCase.ts`
- [ ] Controller: `WorkerPaymentInfoController.ts`
- [ ] Endpoints:
  - [ ] `POST /api/workers/:id/payment-info` - Cadastrar dados bancários
  - [ ] `GET /api/workers/:id/payment-info` - Buscar dados bancários
  - [ ] `PUT /api/workers/:id/payment-info` - Atualizar dados bancários
  - [ ] `PUT /api/workers/:id/payment-info/verify` - Admin verificar (aprovar/rejeitar)

### ⚪ Frontend - Worker

**Componente: `PaymentInfoPage.tsx`**

- [ ] Formulário de dados bancários
- [ ] Campos:
  - [ ] País (AR/BR)
  - [ ] Nome do titular
  - [ ] CUIT/CUIL (AR) ou CPF/CNPJ (BR)
  - [ ] Banco
  - [ ] Agência
  - [ ] Número da conta
  - [ ] Tipo de conta (corrente/poupança)
  - [ ] Chave PIX (BR) ou CVU/Alias (AR)
- [ ] Validação por país
- [ ] Status: pending → submitted → verified/rejected

### ⚪ Frontend - Admin

**Componente: `AdminPaymentVerificationPage.tsx`**

- [ ] Listar workers com `payment_status = 'submitted'`
- [ ] Verificar dados bancários
- [ ] Aprovar / Rejeitar
- [ ] Campo de feedback

---

## 🔧 Tarefas Técnicas Transversais

### ⚪ Infraestrutura

- [ ] Configurar Cloud Storage (Firebase Storage ou GCS)
- [ ] Implementar upload de arquivos com retry
- [ ] Implementar compressão de PDFs
- [ ] Configurar CDN para servir documentos
- [ ] Implementar rate limiting nos endpoints de upload
- [ ] Configurar backup automático de documentos

### ⚪ Segurança

- [ ] Validação de tipos MIME (apenas PDF)
- [ ] Scan de vírus em uploads
- [ ] Criptografia de dados sensíveis em repouso
- [ ] Logs de auditoria para acesso a documentos
- [ ] Implementar RBAC (Role-Based Access Control)
- [ ] Proteção contra CSRF em uploads

### ⚪ Performance

- [ ] Lazy loading de PDFs
- [ ] Paginação de listas (vagas, candidaturas)
- [ ] Cache de queries frequentes
- [ ] Índices otimizados no banco
- [ ] Compressão de respostas HTTP

### ⚪ Testes

- [ ] Testes unitários: Use Cases
- [ ] Testes unitários: Repositories
- [ ] Testes de integração: Endpoints
- [ ] Testes E2E: Fluxo completo de registro
- [ ] Testes E2E: Fluxo de candidatura
- [ ] Testes de carga: Upload de documentos

### ⚪ Monitoramento

- [ ] Logs estruturados (Winston/Pino)
- [ ] Métricas de upload (tempo, tamanho, taxa de sucesso)
- [ ] Alertas de erros críticos
- [ ] Dashboard de status de workers
- [ ] Dashboard de vagas e candidaturas

---

## 📅 Cronograma Sugerido

### Sprint 1 (1-2 semanas)
- [ ] Corrigir campos faltando no Step 1
- [ ] Criar tela de upload de documentos (frontend)
- [ ] Implementar backend de documentos

### Sprint 2 (1-2 semanas)
- [ ] Criar sistema de vagas (admin)
- [ ] Criar listagem de vagas (worker)
- [ ] Implementar guard de candidatura

### Sprint 3 (1-2 semanas)
- [ ] Implementar sistema de candidaturas
- [ ] Tela de "Minhas Candidaturas" (worker)
- [ ] Tela de gestão de candidatos (admin)

### Sprint 4 (1-2 semanas)
- [ ] Implementar dados financeiros
- [ ] Tela de verificação de pagamentos (admin)

### Sprint 5+ (Futuro)
- [ ] Sistema de match automático
- [ ] Notificações push
- [ ] Dashboard analytics

---

## 🎯 Prioridades Imediatas

### 🔴 URGENTE (Fazer AGORA)

1. **Corrigir campos do Step 1**
   - Conectar todos os selects
   - Atualizar store
   - Corrigir payload do backend

2. **Rodar migrations no banco**
   ```bash
   npm run migrate
   ```

### 🟡 ALTA (Próxima semana)

3. **Criar tela de upload de documentos**
4. **Implementar backend de documentos**
5. **Implementar guard de candidatura**

### 🟢 MÉDIA (Próximas 2-4 semanas)

6. **Sistema de vagas**
7. **Sistema de candidaturas**

### ⚪ BAIXA (Backlog)

8. **Dados financeiros**
9. **Sistema de match**
10. **Notificações**

---

## 📝 Notas Importantes

- **NÃO MEXER** na estrutura atual de 3 steps do registro
- Campos adicionais serão coletados na tela de documentos
- Worker **SÓ PODE** se candidatar a vagas após `documents_status = 'approved'`
- Documentos são enviados **UMA VEZ** e reutilizados em todas as candidaturas
- Sistema de match é **FUTURO**, não bloqueia candidaturas manuais

---

## 🔗 Referências

- Migrations: `/Users/gabrielstein-dev/projects/enlite/worker-functions/migrations/`
- Entities: `/Users/gabrielstein-dev/projects/enlite/worker-functions/src/domain/entities/`
- Mapeamento de campos: `/Users/gabrielstein-dev/projects/enlite/worker-functions/docs/WORKER_FIELDS_MAPPING.md`
- Tela de registro: `/Users/gabrielstein-dev/projects/enlite/enlite-frontend/src/presentation/pages/WorkerRegistrationPage.tsx`
