# Google Cloud Storage - Configuração para Upload de Documentos

## Visão Geral

O sistema utiliza **Google Cloud Storage (GCS)** com **Signed URLs v4** para upload direto de documentos PDF dos workers, sem passar pelo backend Node.js.

## Pré-requisitos

### 1. Criar o Bucket GCS

```bash
# Substitua pelo nome do seu projeto
export PROJECT_ID="enlite-health-prod"
export BUCKET_NAME="enlite-worker-documents"
export REGION="southamerica-east1"

# Criar bucket privado
gsutil mb -p $PROJECT_ID -c STANDARD -l $REGION gs://$BUCKET_NAME

# Definir como privado (sem acesso público)
gsutil iam ch allUsers:objectViewer gs://$BUCKET_NAME
gsutil iam ch -d allUsers:objectViewer gs://$BUCKET_NAME
```

### 2. Configurar CORS no Bucket

**CRÍTICO:** O bucket precisa permitir requisições PUT do frontend.

Crie um arquivo `cors.json`:

```json
[
  {
    "origin": [
      "http://localhost:3000",
      "http://localhost:5173",
      "https://enlite-frontend-121472682203.us-central1.run.app"
    ],
    "method": ["GET", "PUT", "OPTIONS"],
    "responseHeader": ["Content-Type", "Content-Length"],
    "maxAgeSeconds": 3600
  }
]
```

Aplique a configuração CORS:

```bash
gsutil cors set cors.json gs://$BUCKET_NAME
```

Verifique:

```bash
gsutil cors get gs://$BUCKET_NAME
```

### 3. Configurar Permissões da Service Account

A service account usada pelo Cloud Run (ou localmente) precisa de permissões para:
- Gerar signed URLs
- Fazer upload de arquivos
- Deletar arquivos

```bash
# Obter email da service account do Cloud Run
export SERVICE_ACCOUNT="worker-functions@${PROJECT_ID}.iam.gserviceaccount.com"

# Conceder permissões no bucket
gsutil iam ch serviceAccount:${SERVICE_ACCOUNT}:roles/storage.objectAdmin gs://$BUCKET_NAME
```

**Permissões necessárias:**
- `storage.objects.create` - criar objetos
- `storage.objects.delete` - deletar objetos
- `storage.objects.get` - ler objetos
- `storage.buckets.get` - acessar metadados do bucket

O role `roles/storage.objectAdmin` inclui todas essas permissões.

### 4. Variáveis de Ambiente

No **worker-functions**, configure:

```bash
# .env
GCP_PROJECT_ID=enlite-health-prod
GCS_BUCKET_NAME=enlite-worker-documents
NODE_ENV=production
```

**Autenticação:**
- **Cloud Run:** Usa **Application Default Credentials (ADC)** automaticamente via service account anexada ao serviço
- **Desenvolvimento local:** Use `gcloud auth application-default login` ou configure uma service account

## Fluxo de Upload

1. **Frontend** chama `POST /api/workers/me/documents/upload-url` com `{ docType: "resume_cv" }`
2. **Backend** gera signed URL v4 (válida por 15 minutos) e retorna `{ signedUrl, filePath }`
3. **Frontend** faz `PUT` direto para a signed URL com o arquivo PDF
4. **Frontend** chama `POST /api/workers/me/documents/save` com `{ docType, filePath }`
5. **Backend** salva o `filePath` no banco de dados

## Troubleshooting

### Erro 500 ao gerar signed URL

**Sintoma:** `Failed to generate signed URL`

**Causas possíveis:**
1. **Bucket não existe** - verifique se o bucket foi criado
2. **Service account sem permissões** - precisa de `roles/storage.objectAdmin`
3. **`GCP_PROJECT_ID` não configurado** - obrigatório para inicializar Firebase Admin
4. **`GCS_BUCKET_NAME` incorreto** - deve corresponder ao bucket real
5. **Firebase Admin não inicializado com `storageBucket`** - verifique `MultiAuthService.ts`

**Debug:**
```bash
# Verificar se bucket existe
gsutil ls gs://$BUCKET_NAME

# Verificar permissões da service account
gsutil iam get gs://$BUCKET_NAME

# Testar credenciais localmente (desenvolvimento)
gcloud auth application-default login

# Verificar logs do Cloud Run
gcloud run logs read worker-functions --limit=50
```

### Erro CORS ao fazer PUT

**Sintoma:** `No 'Access-Control-Allow-Origin' header is present`

**Solução:**
1. Verifique se CORS está configurado: `gsutil cors get gs://$BUCKET_NAME`
2. Adicione o domínio do frontend na lista de origins permitidas
3. Reaplique a configuração CORS

### Mock Mode ativado sem querer

**Sintoma:** Signed URL retorna `http://localhost:8080/mock-gcs-upload`

**Causa:** `NODE_ENV=development` ou `NODE_ENV=test` e sem `GCP_PROJECT_ID`

**Solução:**
```bash
# Opção 1: Configurar credenciais ADC localmente
gcloud auth application-default login
export GCP_PROJECT_ID=enlite-health-prod

# Opção 2: Desabilitar mock mode forçadamente
export DISABLE_GCS_MOCK=true
export GCP_PROJECT_ID=enlite-health-prod

# Opção 3: Usar NODE_ENV=production
export NODE_ENV=production
```

## Segurança (LGPD/HIPAA)

- ✅ Bucket é **privado** (sem acesso público)
- ✅ Signed URLs têm **TTL curto** (15min upload, 60min view)
- ✅ Apenas workers autenticados podem gerar URLs
- ✅ Path inclui `workerId` para isolamento
- ✅ Logs não expõem conteúdo de documentos

## Melhores Práticas Google Cloud

Baseado na [documentação oficial](https://cloud.google.com/storage/docs/access-control/signed-urls):

1. **Use Signed URLs v4** ✅ (implementado)
2. **Especifique Content-Type** ✅ (`application/pdf`)
3. **TTL curto para uploads** ✅ (15 minutos)
4. **CORS configurado corretamente** ⚠️ (verificar)
5. **Service account com permissões mínimas** ✅ (`objectAdmin` apenas no bucket específico)

## Referências

- [Signed URLs - Google Cloud](https://cloud.google.com/storage/docs/access-control/signed-urls)
- [CORS Configuration - GCS](https://cloud.google.com/storage/docs/configuring-cors)
- [IAM Permissions - Storage](https://cloud.google.com/storage/docs/access-control/iam-permissions)
