#!/bin/bash

# Criar Cloud SQL db-f1-micro para n8n (standalone)
# Usage: ./create-n8n-database.sh [PROJECT_ID] [REGION] [INSTANCE_NAME]

set -e

PROJECT_ID=${1:-your-gcp-project-id}
REGION=${2:-us-central1}
INSTANCE_NAME=${3:-n8n-postgres}
DB_NAME="n8n"
DB_USER="n8n_user"

echo "🗄️  Criando Cloud SQL PostgreSQL para n8n"
echo "Project: ${PROJECT_ID}"
echo "Region: ${REGION}"
echo "Instance: ${INSTANCE_NAME}"
echo "Tier: db-f1-micro"
echo ""

# Verificar se gcloud está instalado
if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI não encontrado."
    exit 1
fi

# Configurar projeto
gcloud config set project ${PROJECT_ID}

# Habilitar APIs
echo "🔧 Habilitando APIs..."
gcloud services enable sqladmin.googleapis.com
gcloud services enable secretmanager.googleapis.com

# Verificar se instância já existe
if gcloud sql instances describe ${INSTANCE_NAME} --project=${PROJECT_ID} &> /dev/null 2>&1; then
    echo "⚠️  Instância ${INSTANCE_NAME} já existe."
    echo "   Para usar existente, execute o deploy-cloud-run.sh com o nome da instância."
    exit 0
fi

# Gerar senhas seguras
DB_PASSWORD=$(openssl rand -base64 32)

echo "🚀 Criando instância Cloud SQL PostgreSQL 15 (db-f1-micro)..."
gcloud sql instances create ${INSTANCE_NAME} \
    --database-version=POSTGRES_15 \
    --tier=db-f1-micro \
    --region=${REGION} \
    --storage-size=10GB \
    --storage-auto-increase \
    --availability-type=ZONAL \
    --backup-start-time="03:00" \
    --maintenance-window-day=SUN \
    --maintenance-window-hour=4 \
    --no-deletion-protection  # Habilitar proteção em produção real

echo "✅ Instância criada!"

# Criar banco de dados
echo "📝 Criando banco '${DB_NAME}'..."
gcloud sql databases create ${DB_NAME} --instance=${INSTANCE_NAME}

# Criar usuário
echo "👤 Criando usuário '${DB_USER}'..."
gcloud sql users create ${DB_USER} \
    --instance=${INSTANCE_NAME} \
    --password="${DB_PASSWORD}"

# Salvar senha no Secret Manager
echo "🔐 Salvando credenciais no Secret Manager..."
echo -n "${DB_PASSWORD}" | gcloud secrets create n8n-db-password --data-file=-
echo -n "${INSTANCE_NAME}" | gcloud secrets create n8n-db-instance --data-file=-

# Obter connection name
CONNECTION_NAME=$(gcloud sql instances describe ${INSTANCE_NAME} --format='value(connectionName)')

echo ""
echo "✅ Banco n8n criado com sucesso!"
echo ""
echo "📋 INFORMAÇÕES:"
echo "   • Instance Name: ${INSTANCE_NAME}"
echo "   • Connection Name: ${CONNECTION_NAME}"
echo "   • Database: ${DB_NAME}"
echo "   • User: ${DB_USER}"
echo "   • Tier: db-f1-micro (~$7-15/mês dependendo do uso)"
echo ""
echo "🔐 Secrets criados no Secret Manager:"
echo "   • n8n-db-password (senha do banco)"
echo "   • n8n-db-instance (nome da instância)"
echo ""
echo "🚀 Para fazer deploy do n8n usando este banco, execute:"
echo "   ./deploy-cloud-run.sh ${PROJECT_ID} ${REGION} ${CONNECTION_NAME}"
echo ""
