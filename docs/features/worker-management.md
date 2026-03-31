# Gestao de Workers (WRK)

## O que e

Ciclo de vida completo do profissional de saude (AT — Acompanhante Terapeutico) na plataforma: desde o cadastro multi-step, passando por documentacao, ate gestao de status e ocupacao pelo admin. Workers completam um perfil progressivo com informacoes pessoais, area de atuacao e documentos obrigatorios.

## Por que existe

A Enlite precisa:
1. Captar ATs de multiplas fontes (app, Talentum, planilhas) e unificar em um perfil unico
2. Garantir documentacao completa antes da alocacao (curriculo, antecedentes, seguro)
3. Dar visibilidade ao admin sobre o estado de cada worker e seus documentos

## Como funciona

### Cadastro Multi-Step (Worker App)

```
Worker abre app
  |  POST /api/workers/init
  |  Reconcilia com pre-importados (telefone/email)
  v
Step 1: Quiz de Skills
  |  POST /api/workers/save-step (step=1)
  |  Respostas do quiz
  v
Step 2: Informacoes Pessoais
  |  POST /api/workers/save-step (step=2)
  |  Nome, nascimento, documento, experiencia, preferencias
  v
Step 3: Area de Atuacao
  |  POST /api/workers/save-step (step=3)
  |  Zonas de trabalho, preferencias geograficas
  v
Status: REGISTERED (perfil completo)
```

### Upload de Documentos

```
Worker
  |  POST /workers/me/documents/upload-signed-url
  |  Recebe signed URL do GCS
  v
Upload direto para Google Cloud Storage
  |  POST /workers/me/documents/save-document-path
  |  Salva referencia no banco
  v
Admin
  |  PUT /workers/:id/documents/review
  |  Aprova ou rejeita com notas
  v
Status: pending -> submitted -> under_review -> approved/rejected
```

### Gestao Admin

- **Lista de workers** com filtros: plataforma de origem, status de documentos, paginacao
- **Status dashboard**: contadores por status (REGISTERED, INCOMPLETE_REGISTER, DISABLED)
- **Alteracao de status/ocupacao**: com audit trail via `SET LOCAL app.current_uid`
- **Rastreio de expiracao de documentos**: alerta para docs vencendo em 30 dias

## Endpoints

### Worker (self-service)

| Metodo | Rota | Funcao |
|--------|------|--------|
| POST | `/api/workers/init` | Inicializar conta |
| POST | `/api/workers/save-step` | Salvar etapa (1-3) |
| GET | `/api/workers/progress` | Progresso do cadastro |
| POST | `/api/workers/me/general-info` | Atualizar info pessoal |
| POST | `/api/workers/me/service-area` | Atualizar area de atuacao |
| POST | `/api/workers/me/documents/upload-signed-url` | URL para upload |
| POST | `/api/workers/me/documents/save-document-path` | Salvar path do doc |
| POST | `/api/workers/me/documents/view-signed-url` | URL para visualizar doc |
| GET | `/api/workers/me/documents` | Meus documentos |
| DELETE | `/api/workers/me/documents/:type` | Deletar documento |

### Admin

| Metodo | Rota | Funcao |
|--------|------|--------|
| GET | `/api/admin/workers` | Listar workers (filtros + paginacao) |
| GET | `/api/admin/workers/stats` | Stats diarios (hoje, ontem, 7d) |
| GET | `/api/admin/workers/status-dashboard` | Contadores por status |
| GET | `/api/admin/workers/by-status/:status` | Workers por status |
| PUT | `/api/admin/workers/:id/status` | Alterar status |
| PUT | `/api/admin/workers/:id/occupation` | Alterar ocupacao |
| GET | `/api/workers/:id/documents` | Ver documentos (admin) |
| PUT | `/api/workers/:id/documents/review` | Revisar documentos |
| PUT | `/api/workers/:id/doc-expiry` | Atualizar validade docs |
| GET | `/api/workers/docs-expiring` | Docs proximos do vencimento |

## Componentes

### Backend

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/interfaces/controllers/WorkerController.ts` | Init e save-step |
| `src/interfaces/controllers/WorkerControllerV2.ts` | Endpoints v2 |
| `src/interfaces/controllers/WorkerDocumentsController.ts` | Docs (admin) |
| `src/interfaces/controllers/WorkerDocumentsMeController.ts` | Docs (self-service) |
| `src/interfaces/controllers/AdminWorkersController.ts` | Lista e stats |
| `src/interfaces/controllers/EncuadreController.ts` | Status, ocupacao, doc-expiry |
| `src/application/use-cases/InitWorkerUseCase.ts` | Logica de init + reconciliacao |
| `src/application/use-cases/SaveStepUseCase.ts` | Salvar cada step |
| `src/application/use-cases/SavePersonalInfoUseCase.ts` | Info pessoal |
| `src/application/use-cases/SaveServiceAreaUseCase.ts` | Area de atuacao |
| `src/application/use-cases/ReviewWorkerDocumentsUseCase.ts` | Revisao de docs |
| `src/infrastructure/repositories/WorkerRepository.ts` | Persistencia worker |
| `src/infrastructure/repositories/WorkerDocumentsRepository.ts` | Persistencia docs |
| `src/infrastructure/services/GCSStorageService.ts` | Signed URLs GCS |
| `src/domain/entities/Worker.ts` | Entidade Worker |
| `src/domain/entities/WorkerDocuments.ts` | Entidade Documentos |

### Frontend

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/presentation/pages/WorkerProfilePage.tsx` | Pagina de perfil (4 tabs) |
| `src/presentation/pages/tabs/GeneralInfoTab.tsx` | Tab info pessoal |
| `src/presentation/pages/tabs/ServiceAddressTab.tsx` | Tab endereco |
| `src/presentation/pages/tabs/AvailabilityTab.tsx` | Tab disponibilidade |
| `src/presentation/pages/tabs/DocumentsTab.tsx` | Tab documentos |
| `src/presentation/pages/admin/AdminWorkersPage.tsx` | Lista workers (admin) |
| `src/presentation/stores/workerRegistrationStore.ts` | Estado do formulario |
| `src/presentation/components/molecules/DocumentUploadCard/` | Card de upload |
| `src/presentation/components/organisms/DocumentsGrid/` | Grid de documentos |
| `src/presentation/hooks/useWorkerApi.ts` | Hook init/progress |
| `src/presentation/hooks/useDocumentsApi.ts` | Hook upload docs |
| `src/hooks/admin/useWorkersData.ts` | Hook lista workers |

## Regras de negocio

- **Reconciliacao**: Workers importados de fontes externas sao detectados por padroes de authUid fake (`anacareimport_*`, `candidatoimport_*`, `pretalnimport_*`) e vinculados ao novo registro
- **Deduplicacao**: Busca por telefone e email antes de criar novo registro
- **Documentos obrigatorios**: Curriculo, RG/CPF, Antecedentes Penais, Registro Profissional, Seguro RC
- **Status de documentos**: `pending` -> `submitted` -> `under_review` -> `approved`/`rejected`
- **Rejeicao**: Admin obrigado a fornecer `reviewNotes` ao rejeitar
- **Expiracao**: Antecedentes, seguro e registro profissional tem datas de validade rastreadas
- **Alerta 30 dias**: Sistema lista workers com documentos vencendo em 30 dias
- **Ocupacoes validas**: AT, CAREGIVER, NURSE, KINESIOLOGIST, PSYCHOLOGIST
- **Status validos**: REGISTERED, INCOMPLETE_REGISTER, DISABLED
- **Workers merged**: Excluidos de listas (merged_into_id IS NULL)
- **Nomes criptografados**: Decriptados via KMS em paralelo para performance

## Integracoes externas

- **Google Cloud Storage (GCS)**: Armazenamento de documentos via signed URLs
- **Google Cloud KMS**: Criptografia/decriptacao de PII (nomes, telefone)
- **Firebase Auth**: Vinculo com authUid
