# Comandos para Configurar Banco de Dados no Cloud SQL

**URGENTE:** Execute estes comandos para resolver o erro "password authentication failed for user enlite_app"

---

## 1. Verificar Instância Cloud SQL

```bash
# Listar todas as instâncias
gcloud sql instances list --project=enlite-prd

# Verificar se enlite-ar-db existe
gcloud sql instances describe enlite-ar-db --project=enlite-prd
```

**Se a instância não existir, crie:**
```bash
gcloud sql instances create enlite-ar-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=southamerica-west1 \
  --project=enlite-prd
```

---

## 2. Criar Banco de Dados

```bash
# Criar banco enlite_ar se não existir
gcloud sql databases create enlite_ar \
  --instance=enlite-ar-db \
  --project=enlite-prd
```

---

## 3. Criar Usuário do Banco de Dados

```bash
# Listar usuários existentes
gcloud sql users list --instance=enlite-ar-db --project=enlite-prd

# Criar usuário enlite_app
gcloud sql users create enlite_app \
  --instance=enlite-ar-db \
  --password=<SENHA_SEGURA_AQUI> \
  --project=enlite-prd
```

**⚠️ IMPORTANTE:** Substitua `<SENHA_SEGURA_AQUI>` por uma senha forte.

---

## 4. Criar Secret no Secret Manager

```bash
# Verificar se o secret já existe
gcloud secrets list --project=enlite-prd | grep enlite-ar-db-password

# Criar secret com a senha do banco
echo -n "<SENHA_SEGURA_AQUI>" | gcloud secrets create enlite-ar-db-password \
  --data-file=- \
  --replication-policy="automatic" \
  --project=enlite-prd

# Dar permissão para a service account acessar o secret
gcloud secrets add-iam-policy-binding enlite-ar-db-password \
  --member="serviceAccount:enlite-functions-sa@enlite-prd.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project=enlite-prd
```

---

## 5. Configurar Service Account com Permissões Firebase

```bash
# Verificar se a service account existe
gcloud iam service-accounts list --project=enlite-prd | grep enlite-functions-sa

# Criar service account se não existir
gcloud iam service-accounts create enlite-functions-sa \
  --display-name="Enlite Functions Service Account" \
  --project=enlite-prd

# Adicionar permissões Firebase
gcloud projects add-iam-policy-binding enlite-prd \
  --member="serviceAccount:enlite-functions-sa@enlite-prd.iam.gserviceaccount.com" \
  --role="roles/firebase.admin"

# Adicionar permissões Cloud SQL
gcloud projects add-iam-policy-binding enlite-prd \
  --member="serviceAccount:enlite-functions-sa@enlite-prd.iam.gserviceaccount.com" \
  --role="roles/cloudsql.client"

# Adicionar permissões Secret Manager
gcloud projects add-iam-policy-binding enlite-prd \
  --member="serviceAccount:enlite-functions-sa@enlite-prd.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

---

## 6. Executar Migrations

```bash
# Conectar ao Cloud SQL via proxy
cloud_sql_proxy -instances=enlite-prd:southamerica-west1:enlite-ar-db=tcp:5432 &

# Executar migrations
cd /Users/gabrielstein-dev/projects/enlite/worker-functions
export DATABASE_URL="postgresql://enlite_app:<SENHA>@localhost:5432/enlite_ar"
bash run_migrations.sh
```

---

## 7. Fazer Deploy

Após configurar tudo acima:

```bash
cd /Users/gabrielstein-dev/projects/enlite/worker-functions
bash scripts/deploy.sh
```

---

## 8. Verificar Logs

```bash
# Ver logs em tempo real
gcloud run services logs tail worker-functions \
  --region=southamerica-west1 \
  --project=enlite-prd

# Ver logs de erro
gcloud run services logs read worker-functions \
  --region=southamerica-west1 \
  --project=enlite-prd \
  --filter="severity=ERROR" \
  --limit=50
```

---

## Checklist de Verificação

- [ ] Instância Cloud SQL `enlite-ar-db` existe
- [ ] Banco de dados `enlite_ar` existe
- [ ] Usuário `enlite_app` existe com senha correta
- [ ] Secret `enlite-ar-db-password` existe no Secret Manager
- [ ] Service account `enlite-functions-sa` existe
- [ ] Service account tem permissões: `firebase.admin`, `cloudsql.client`, `secretmanager.secretAccessor`
- [ ] Migrations executadas com sucesso
- [ ] Deploy realizado
- [ ] Logs não mostram erros de autenticação ou banco de dados

---

## Troubleshooting

### Erro: "Instance does not exist"
```bash
# Verificar nome correto da instância
gcloud sql instances list --project=enlite-prd
```

### Erro: "Permission denied"
```bash
# Verificar permissões da service account
gcloud projects get-iam-policy enlite-prd \
  --flatten="bindings[].members" \
  --filter="bindings.members:enlite-functions-sa@enlite-prd.iam.gserviceaccount.com"
```

### Erro: "Secret not found"
```bash
# Listar todos os secrets
gcloud secrets list --project=enlite-prd
```
