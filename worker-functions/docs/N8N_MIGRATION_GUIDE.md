# Guia de Migração do n8n para Argentina (southamerica-west1)

## Contexto

O n8n estava deployado em `us-central1` (Estados Unidos), mas precisa estar em `southamerica-west1` (Argentina) para:
- **Compliance LGPD/PDPA**: Dados de saúde devem residir na região da Argentina
- **Latência**: Melhor performance para operações locais
- **Consistência**: Toda a stack (Cloud SQL, Cloud Run, n8n) na mesma região

## Arquitetura Antes vs Depois

### Antes (us-central1)
```
┌─────────────────────────────────────┐
│         us-central1 (USA)           │
├─────────────────────────────────────┤
│ • enlite-n8n (Cloud Run)            │
│ • enlite-n8n-db (Cloud SQL)         │
│ • URL: enlite-n8n-byh3gvl5yq-uc...  │
└─────────────────────────────────────┘
```

### Depois (southamerica-west1)
```
┌─────────────────────────────────────┐
│    southamerica-west1 (Argentina)   │
├─────────────────────────────────────┤
│ • enlite-n8n-ar (Cloud Run)         │
│ • enlite-n8n-db-ar (Cloud SQL)      │
│ • worker-functions (Cloud Run)      │
│ • enlite-ar-db (Cloud SQL)          │
└─────────────────────────────────────┘
```

## Execução da Migração

### Pré-requisitos

1. **Acesso ao GCP** com permissões:
   - `roles/cloudsql.admin`
   - `roles/run.admin`
   - `roles/storage.admin`
   - `roles/secretmanager.admin`

2. **gcloud CLI** configurado:
   ```bash
   gcloud auth login
   gcloud config set project enlite-prd
   ```

3. **Backup manual** (recomendado):
   ```bash
   # Exportar workflows via UI do n8n
   # Settings → Import/Export → Export all workflows
   ```

### Executar Script de Migração

```bash
cd /Users/gabrielstein-dev/projects/enlite/worker-functions
./scripts/migrate-n8n-to-argentina.sh
```

O script irá:
1. ✅ Criar Cloud SQL PostgreSQL em `southamerica-west1`
2. ✅ Exportar dados do n8n atual via `gcloud sql export`
3. ✅ Criar novo serviço `enlite-n8n-ar` em `southamerica-west1`
4. ✅ Importar dados para o novo banco
5. ✅ Configurar todas as variáveis de ambiente e secrets
6. ⏸️ Manter instância antiga ativa até validação

**Tempo estimado:** 15-20 minutos

## Validação Pós-Migração

### 1. Verificar n8n está acessível

```bash
# Obter URL do novo n8n
NEW_N8N_URL=$(gcloud run services describe enlite-n8n-ar \
  --region=southamerica-west1 \
  --project=enlite-prd \
  --format='value(status.url)')

echo "Novo n8n: $NEW_N8N_URL"

# Testar health check
curl -I $NEW_N8N_URL/health
# Esperado: HTTP/2 200
```

### 2. Validar workflows no n8n

Acesse o n8n via browser:
```bash
open $NEW_N8N_URL
```

Verificar:
- [ ] Login funciona (mesmas credenciais)
- [ ] Todos os workflows estão presentes
- [ ] Executions history está preservado
- [ ] Credentials (HubSpot, Twilio, Google Calendar) estão configuradas

### 3. Testar webhook do worker-functions

```bash
# Atualizar N8N_WEBHOOK_URL no worker-functions
gcloud run services update worker-functions \
  --region=southamerica-west1 \
  --update-env-vars="N8N_WEBHOOK_URL=$NEW_N8N_URL" \
  --project=enlite-prd

# Verificar se a variável foi atualizada
gcloud run services describe worker-functions \
  --region=southamerica-west1 \
  --project=enlite-prd \
  --format='value(spec.template.spec.containers[0].env[?(@.name=="N8N_WEBHOOK_URL")].value)'
```

### 4. Teste end-to-end

Simular um evento que dispara webhook para o n8n:

```bash
# Exemplo: completar step 2 de um worker
curl -X PUT https://worker-functions-121472682203.southamerica-west1.run.app/api/workers/step \
  -H "Authorization: Bearer <FIREBASE_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "step": 2,
    "data": {
      "firstName": "Test",
      "lastName": "Migration"
    }
  }'
```

Verificar no n8n:
- [ ] Workflow foi disparado
- [ ] Execution aparece no histórico
- [ ] Integração com HubSpot/Twilio funcionou

### 5. Monitorar logs por 48h

```bash
# Logs do n8n
gcloud run services logs tail enlite-n8n-ar \
  --region=southamerica-west1 \
  --project=enlite-prd

# Logs do worker-functions
gcloud run services logs tail worker-functions \
  --region=southamerica-west1 \
  --project=enlite-prd \
  --filter="N8N"
```

## Rollback (se necessário)

Se houver problemas críticos, reverter para a instância antiga:

```bash
# 1. Reverter N8N_WEBHOOK_URL no worker-functions
gcloud run services update worker-functions \
  --region=southamerica-west1 \
  --update-env-vars="N8N_WEBHOOK_URL=https://enlite-n8n-byh3gvl5yq-uc.a.run.app" \
  --project=enlite-prd

# 2. Investigar problema no novo n8n
gcloud run services logs read enlite-n8n-ar \
  --region=southamerica-west1 \
  --project=enlite-prd \
  --limit=100
```

## Limpeza (após validação de 48h)

**⚠️ SOMENTE após confirmar que tudo está funcionando:**

```bash
# 1. Deletar serviço n8n antigo (us-central1)
gcloud run services delete enlite-n8n \
  --region=us-central1 \
  --project=enlite-prd

# 2. Deletar Cloud SQL antigo (us-central1)
# ATENÇÃO: Fazer backup final antes!
gcloud sql export sql enlite-n8n-db \
  gs://enlite-n8n-backups/final-backup-$(date +%Y%m%d).sql \
  --database=n8n \
  --project=enlite-prd

gcloud sql instances delete enlite-n8n-db \
  --project=enlite-prd

# 3. Limpar backups antigos (após 30 dias)
gsutil rm gs://enlite-n8n-backups/n8n-export-*.sql
```

## Custos

### Antes (us-central1)
- Cloud SQL `db-f1-micro`: ~$7/mês
- Cloud Run n8n (min=1): ~$15/mês
- **Total:** ~$22/mês

### Depois (southamerica-west1)
- Cloud SQL `db-f1-micro`: ~$7/mês
- Cloud Run n8n (min=1): ~$15/mês
- **Total:** ~$22/mês

**Custo adicional durante migração (48h):** ~$3 (duas instâncias rodando em paralelo)

## Troubleshooting

### Erro: "Cloud SQL connection failed"

```bash
# Verificar se Cloud SQL Proxy está configurado
gcloud run services describe enlite-n8n-ar \
  --region=southamerica-west1 \
  --project=enlite-prd \
  --format='value(spec.template.metadata.annotations["run.googleapis.com/cloudsql-instances"])'

# Deve retornar: enlite-prd:southamerica-west1:enlite-n8n-db-ar
```

### Erro: "Secret not found"

```bash
# Verificar secrets
gcloud secrets describe n8n-encryption-key --project=enlite-prd
gcloud secrets describe n8n-db-password --project=enlite-prd

# Criar se não existir
echo -n "sua-senha-aqui" | gcloud secrets create n8n-db-password \
  --data-file=- \
  --replication-policy=automatic \
  --project=enlite-prd
```

### Workflows não aparecem após migração

```bash
# Verificar se o export/import foi bem-sucedido
gcloud sql operations list \
  --instance=enlite-n8n-db-ar \
  --project=enlite-prd \
  --limit=5

# Se necessário, reimportar manualmente
gcloud sql import sql enlite-n8n-db-ar \
  gs://enlite-n8n-backups/n8n-export-YYYYMMDD-HHMMSS.sql \
  --database=n8n \
  --project=enlite-prd
```

## Checklist de Migração

- [ ] Backup manual dos workflows exportado via UI
- [ ] Script de migração executado sem erros
- [ ] n8n acessível na nova URL
- [ ] Login funciona
- [ ] Todos workflows presentes
- [ ] Credentials configuradas
- [ ] N8N_WEBHOOK_URL atualizado no worker-functions
- [ ] Teste end-to-end executado com sucesso
- [ ] Monitoramento ativo por 48h
- [ ] Sem erros nos logs
- [ ] Instâncias antigas deletadas (após validação)

## Referências

- [Cloud SQL Migration Guide](https://cloud.google.com/sql/docs/postgres/migrate-data)
- [Cloud Run Multi-region](https://cloud.google.com/run/docs/multiple-regions)
- [n8n Database Configuration](https://docs.n8n.io/hosting/configuration/database/)
