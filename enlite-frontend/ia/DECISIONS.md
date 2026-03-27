# Decisões Técnicas - Enlite Frontend

Registro de decisões técnicas relevantes com data e justificativa.

---

## 2026-03-19: Upload de Documentos via GCS Signed URLs

**Decisão:** Utilizar Google Cloud Storage com Signed URLs (PUT direto) para upload de documentos.

**Alternativas consideradas:**
- Firebase Storage (mais simples, mas coupling com Firebase)
- Backend proxy (mais simples de implementar, mas limita escala e adiciona latência)
- Signed URLs GCS (melhor prática para arquivos grandes)

**Justificativa:**
- Arquivos até 10MB → signed URL é o padrão de mercado
- Upload direto ao GCS sem passar pelo backend Node.js → evita timeout e uso de memória
- Acesso 100% controlado: nenhum arquivo tem URL pública, apenas via signed URL com TTL
- firebase-admin já estava instalado no backend → zero dependências novas

**Detalhes de implementação:**
- Upload URL: TTL 15 min, contentType=application/pdf
- View URL: TTL 60 min, gerada sob demanda
- Bucket: privado, nomeado via `GCS_BUCKET_NAME` env var
- Path no bucket: `workers/{workerId}/{docType}/{uuid}.pdf`

**Configuração necessária (infra):**
- CORS no bucket GCS deve permitir PUT do domínio do frontend
- Service account deve ter `roles/storage.objectAdmin` no bucket
- `GCS_BUCKET_NAME` deve ser setado no `.env` de produção

---

## 2026-03-19: Aba Documentos no WorkerProfilePage (não página separada)

**Decisão:** Implementar documentos como aba no `WorkerProfilePage` existente, não como página separada `/worker/documents`.

**Justificativa:**
- O roadmap mencionava `/worker/documents` mas o padrão existente de perfil usa abas (general, address, availability)
- Manter consistência de UX com as outras seções de perfil
- Evita nova rota e nova página — menos código
- O worker pode gerenciar documentos junto com os outros dados do perfil

---

## 2026-03-19: DocumentUploadCard como Molecule (não Organism)

**Decisão:** `DocumentUploadCard` classificado como Molecule; lógica de upload delegada ao `DocumentsGrid` organism via callbacks.

**Justificativa:**
- O card é uma unidade funcional simples (ícone + label + ações)
- Não faz chamadas de API diretamente — recebe callbacks do pai
- A lógica de "qual tipo de documento" e orquestração de upload pertence ao organism
- Respeita o princípio de Atomic Design: atoms formam molecules, molecules formam organisms

---

## 2026-03-19: clearDocumentField no WorkerDocumentsRepository

**Decisão:** Adicionar método `clearDocumentField(workerId, columnName)` ao repositório para deletar um documento específico.

**Justificativa:**
- O método `update` existente usa `COALESCE($n, existing_value)` que não permite setar campos para NULL
- Para deleção, precisamos de um UPDATE explícito `SET column = NULL`
- Allowlist de colunas válidas dentro do método previne SQL injection
- Interface `IWorkerDocumentsRepository` foi extendida de forma aditiva (não breaking)
