#!/bin/bash

# Deploy n8n to Google Cloud Run (Official Method)
# Documentação: https://docs.n8n.io/hosting/installation/server-setups/google-cloud-run/
# 
# PRÉ-REQUISITOS:
# 1. gcloud CLI instalado e autenticado
# 2. Projeto GCP criado e selecionado
# 3. Cloud SQL instance criada (PostgreSQL 15+)
# 4. Secrets criados no Secret Manager
#
# Usage: ./deploy-cloud-run.sh [PROJECT_ID] [REGION] [CLOUD_SQL_INSTANCE]

set -e

PROJECT_ID=${1:-your-gcp-project-id}
REGION=${2:-us-central1}
CLOUD_SQL_CONNECTION=${3:-your-project-id:us-central1:n8n-db}
# Extrair nome da instância do connection name (última parte depois do último ':')
CLOUD_SQL_INSTANCE=$(echo "$CLOUD_SQL_CONNECTION" | awk -F':' '{print $3}')
SERVICE_NAME="enlite-n8n"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"
DB_NAME="n8n"
DB_USER="n8n_user"

echo "🚀 Deploying n8n to Google Cloud Run (Official Method)"
echo "Project: ${PROJECT_ID}"
echo "Region: ${REGION}"
echo "Service: ${SERVICE_NAME}"
echo "Cloud SQL: ${CLOUD_SQL_INSTANCE}"
echo ""

# Verificar se gcloud está instalado
if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI não encontrado."
    echo "   Instale em: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Configurar projeto
echo "📋 Configurando projeto..."
gcloud config set project ${PROJECT_ID}

# Habilitar APIs necessárias
echo "🔧 Habilitando APIs..."
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com
gcloud services enable sqladmin.googleapis.com
gcloud services enable secretmanager.googleapis.com

# 1. Primeiro, definir e armazenar a senha do DB
echo "🔐 Configurando Secret Manager para o Banco de Dados..."
if ! gcloud secrets describe n8n-db-password --project=${PROJECT_ID} &> /dev/null 2>&1; then
    echo "   Criando secret: n8n-db-password"
    DB_PASSWORD=$(openssl rand -base64 32)
    echo -n "$DB_PASSWORD" | gcloud secrets create n8n-db-password --data-file=-
else
    DB_PASSWORD=$(gcloud secrets versions access latest --secret=n8n-db-password --project=${PROJECT_ID})
fi

# N8N_ENCRYPTION_KEY
if ! gcloud secrets describe n8n-encryption-key --project=${PROJECT_ID} &> /dev/null 2>&1; then
    echo "   Criando secret: n8n-encryption-key"
    ENCRYPTION_KEY=$(openssl rand -base64 32)
    echo -n "$ENCRYPTION_KEY" | gcloud secrets create n8n-encryption-key --data-file=-
fi

# 2. Criar Cloud SQL instance se não existir
echo "🗄️  Verificando Cloud SQL instance..."
if ! gcloud sql instances describe ${CLOUD_SQL_INSTANCE} --project=${PROJECT_ID} &> /dev/null 2>&1; then
    echo "   Criando Cloud SQL instance PostgreSQL 15..."
    gcloud sql instances create ${CLOUD_SQL_INSTANCE} \
        --database-version=POSTGRES_15 \
        --tier=db-f1-micro \
        --region=${REGION} \
        --storage-size=10GB \
        --storage-auto-increase
    
    gcloud sql databases create ${DB_NAME} --instance=${CLOUD_SQL_INSTANCE}
    
    # Usar a MESMA senha gerada para o Secret
    gcloud sql users create ${DB_USER} \
        --instance=${CLOUD_SQL_INSTANCE} \
        --password="${DB_PASSWORD}"
    
    echo "✅ Cloud SQL instance e usuário criados!"
fi

# Construir imagem Docker para linux/amd64 (Cloud Run requirement)
echo "🐳 Construindo imagem Docker (linux/amd64)..."
docker build --platform linux/amd64 -t ${IMAGE_NAME} .

# Push para Container Registry
echo "📤 Enviando imagem para Container Registry..."
docker push ${IMAGE_NAME}

# Garantir permissões IAM para leitura de secrets
echo "🔑 Garantindo permissões de leitura de secrets..."
PROJECT_NUMBER=$(gcloud projects describe ${PROJECT_ID} --format='value(projectNumber)')
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor" > /dev/null

# Deploy para Cloud Run com Cloud SQL e Secrets
echo "☁️ Deployando para Cloud Run..."
gcloud run deploy ${SERVICE_NAME} \
    --image ${IMAGE_NAME} \
    --region ${REGION} \
    --platform managed \
    --allow-unauthenticated \
    --memory 4Gi \
    --cpu 1 \
    --max-instances 3 \
    --min-instances 0 \
    --concurrency 50 \
    --timeout 3600 \
    --port 5678 \
    --no-cpu-throttling \
    --set-env-vars="N8N_HOST=0.0.0.0" \
    --set-env-vars="N8N_PORT=5678" \
    --set-env-vars="N8N_PROTOCOL=https" \
    --set-env-vars="N8N_ENDPOINT_HEALTH=health" \
    --set-env-vars="N8N_CONCURRENCY_CONTROL_ENABLED=true" \
    --set-env-vars="N8N_CONCURRENCY_CONTROL_MAX=10" \
    --set-env-vars="N8N_PAYLOAD_SIZE_MAX=16" \
    --set-env-vars="EXECUTIONS_MODE=regular" \
    --set-env-vars="N8N_LOG_LEVEL=info" \
    --set-env-vars="NODE_FUNCTION_ALLOW_EXTERNAL=puppeteer" \
    --set-env-vars="DB_TYPE=postgresdb" \
    --set-env-vars="DB_POSTGRESDB_DATABASE=${DB_NAME}" \
    --set-env-vars="DB_POSTGRESDB_HOST=/cloudsql/${CLOUD_SQL_CONNECTION}" \
    --set-env-vars="DB_POSTGRESDB_PORT=5432" \
    --set-env-vars="DB_POSTGRESDB_USER=${DB_USER}" \
    --set-secrets="N8N_ENCRYPTION_KEY=n8n-encryption-key:latest" \
    --set-secrets="DB_POSTGRESDB_PASSWORD=n8n-db-password:latest" \
    --add-cloudsql-instances=${CLOUD_SQL_CONNECTION}

# Obter URL do serviço
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} --region=${REGION} --format='value(status.url)')

# ATUALIZAÇÃO DO WEBHOOK_URL (CRÍTICO)
echo "🔄 A configurar o WEBHOOK_URL do serviço..."
gcloud run services update ${SERVICE_NAME} \
    --region ${REGION} \
    --update-env-vars="WEBHOOK_URL=${SERVICE_URL}"

echo ""
echo "✅ Implementação concluída com sucesso!"
echo ""
echo "🌐 URL do serviço n8n: ${SERVICE_URL}"
echo ""
echo "🔐 Secrets configurados no Secret Manager:"
echo "   • n8n-encryption-key"
echo "   • n8n-db-password"
echo ""
echo "🗄️  Cloud SQL instance: ${CLOUD_SQL_INSTANCE}"
echo ""
echo "📖 PRÓXIMOS PASSOS:"
echo "   1. Aceda ao n8n: ${SERVICE_URL}"
echo "   2. Crie a conta Owner no primeiro acesso (a autenticação básica foi descontinuada)"
echo "   3. Importe o workflow: worker-onboarding-example.json"
echo "   4. Configure as credenciais (HubSpot, Google Calendar, Twilio)"
echo "   5. Atualize a URL do webhook no backend para: ${SERVICE_URL}/webhook/worker-events"
echo ""
echo "📚 Documentação oficial:"
echo "   https://docs.n8n.io/hosting/installation/server-setups/google-cloud-run/"
echo ""
