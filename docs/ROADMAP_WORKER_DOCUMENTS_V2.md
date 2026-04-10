# Roadmap: Worker Documents V2

## Objetivo

Expandir o sistema de documentos de workers para suportar:

1. **Novos documentos fixos**: Dorso de DNI, Certificado de Monotributo, Certificado de AT
2. **Documentos adicionais dinâmicos**: lista "Otros Documentos" onde o worker pode adicionar, visualizar e excluir certificados extras

## Contexto

### Estado atual (V1)

- Tabela `worker_documents` é 1:1 com worker (constraint UNIQUE em `worker_id`)
- 5 documentos fixos como colunas: `resume_cv_url`, `identity_document_url`, `criminal_record_url`, `professional_registration_url`, `liability_insurance_url`
- `additional_certificates_urls TEXT[]` sem estrutura (sem nome, sem tipo, sem vencimento)
- `documents_status` calculado automaticamente: 0 docs = pending, 1-4 = incomplete, 5 = submitted
- Worker self-service NÃO vê/envia certificados adicionais
- `DocumentType` definido em 4 lugares separados (risco de dessincronização)

### Requisitos de negócio

- **Certificado de Monotributo** e **Certificado de AT**: obrigatórios **apenas para workers com `profession = 'AT'`**
- **Dorso de DNI**: obrigatório para **todos** (par com a frente)
- **DNI frente + verso**: se um está presente, o outro é obrigatório. O par só conta como completo se ambos estão presentes
- **"Otros Documentos"**: sempre opcionais, não afetam status. Lista dinâmica com label personalizado
- Workers AT devem ver aviso amigável de que Monotributo e Certificado AT são obrigatórios

### Regras de status

| Profession | Docs obrigatórios | Threshold `submitted` |
|---|---|---|
| AT | 5 atuais + dorso DNI + monotributo + certificado AT | 8 |
| Outros | 5 atuais + dorso DNI | 6 |

## Arquitetura

### Schema (Migration 128)

```sql
-- Novas colunas em worker_documents
ALTER TABLE worker_documents
  ADD COLUMN IF NOT EXISTS identity_document_back_url TEXT,
  ADD COLUMN IF NOT EXISTS monotributo_certificate_url TEXT,
  ADD COLUMN IF NOT EXISTS at_certificate_url TEXT;

-- Nova tabela para documentos dinâmicos
CREATE TABLE IF NOT EXISTS worker_additional_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES workers(id),
  label VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_worker_additional_documents_worker_id
  ON worker_additional_documents(worker_id);
```

### Fluxo `determineStatus` (refatorado)

1. Contar docs base preenchidos (6): resume_cv, identity_document, identity_document_back, criminal_record, professional_registration, liability_insurance
2. Se `profession = 'AT'`, adicionar 2 extras: monotributo_certificate, at_certificate → threshold = 8
3. DNI frente + verso: ambos devem estar presentes para contar (contam como 2, mas só se par completo)

### Endpoints novos (documentos adicionais)

**Worker self-service:**
- `GET /api/workers/me/additional-documents`
- `POST /api/workers/me/additional-documents/upload-url`
- `POST /api/workers/me/additional-documents`
- `DELETE /api/workers/me/additional-documents/:id`

**Admin:**
- `GET /api/admin/workers/:id/additional-documents`
- `POST /api/admin/workers/:id/additional-documents/upload-url`
- `POST /api/admin/workers/:id/additional-documents`
- `DELETE /api/admin/workers/:id/additional-documents/:docId`

### Frontend

- **DocumentsGrid**: adiciona 3 novos cards fixos (dorso DNI agrupado com frente, monotributo, certificado AT)
- **AdditionalDocumentsSection**: nova seção "Otros Documentos" abaixo dos obrigatórios com:
  - Lista de documentos adicionais (label + botão ver + botão excluir)
  - Botão "Agregar documento" (input label + seletor arquivo)
- **AT warning**: aviso amigável quando `profession = 'AT'` indicando que monotributo e certificado AT são obrigatórios
- **WorkerDocumentsCard (admin)**: mesmas mudanças + substituição do bloco read-only `additionalCertificatesUrls`

## Plano de Execução

### Task 1 — Migration 128
- Novas colunas em `worker_documents`
- Nova tabela `worker_additional_documents`
- Migração de dados de `additional_certificates_urls` para nova tabela

### Task 2 — Domain + Repository (campos fixos)
- Atualizar `WorkerDocuments` entity e DTOs
- Expandir queries SQL no `WorkerDocumentsRepository`
- Refatorar `determineStatus` para aceitar `profession` e calcular threshold dinâmico
- Atualizar `clearDocumentField` com novos campos

### Task 3 — Repository (documentos adicionais)
- Criar `WorkerAdditionalDocumentsRepository` com CRUD

### Task 4 — GCS Storage Service
- Adicionar novos `DocumentType`: `identity_document_back`, `monotributo_certificate`, `at_certificate`
- Suportar path `additional` para documentos dinâmicos

### Task 5 — Controllers (campos fixos)
- Atualizar `VALID_DOC_TYPES`, `DOC_JS_FIELD`, `DOC_SQL_COL` nos dois controllers existentes

### Task 6 — Controllers (documentos adicionais)
- Criar `WorkerAdditionalDocumentsMeController`
- Criar `AdminWorkerAdditionalDocumentsController`
- Registrar rotas em `index.ts`

### Task 7 — Frontend: tipos + API + hooks
- Atualizar `DocumentType`, `WorkerDocumentsResponse`, `WorkerDocument`
- Criar métodos de API para documentos adicionais
- Criar hooks

### Task 8 — Frontend: DocumentsGrid + AT warning
- Adicionar 3 novos slots
- Aviso amigável para ATs

### Task 9 — Frontend: seção "Otros Documentos"
- Lista dinâmica com add/delete/view

### Task 10 — Frontend: admin WorkerDocumentsCard
- Atualizar com novos slots + seção de adicionais

### Task 11 — i18n
- Chaves em es.json e pt-BR.json

## Data de início: 2026-04-10
