#!/bin/bash

# Script para rodar migration 042 em produção
# Adiciona colunas: daily_obs, inferred_zone em job_postings e group_geographic_zone em publications

set -e

echo "🚀 Executando Migration 042..."
echo ""

# Verifica gcloud
if ! gcloud config get-value project &>/dev/null; then
    echo "❌ Erro: Não está autenticado no gcloud"
    exit 1
fi

PROJECT=$(gcloud config get-value project)
DB_USER="enlite_app"
DB_NAME="enlite_ar"
INSTANCE="enlite-ar-db"

echo "📦 Projeto: $PROJECT"
echo "🔐 Usuário: $DB_USER"
echo "🗄️  Database: $DB_NAME"
echo ""

# Busca senha do Secret Manager
echo "🔑 Buscando senha no Secret Manager..."
DB_PASSWORD=$(gcloud secrets versions access latest --secret="enlite-ar-db-password" 2>/dev/null)
if [ -z "$DB_PASSWORD" ]; then
    echo "❌ Erro: Não foi possível obter senha"
    exit 1
fi
echo "✅ Senha obtida"
echo ""

# Inicia proxy em background na porta 5435
PROXY_PORT="5435"
INSTANCE_CONN="${PROJECT}:southamerica-west1:enlite-ar-db"

echo "🔌 Iniciando Cloud SQL Proxy..."
cloud-sql-proxy --port "$PROXY_PORT" "$INSTANCE_CONN" &
PROXY_PID=$!

# Aguarda proxy iniciar
sleep 4

# Executa migration via psql
echo "📤 Executando migration 042..."
PGPASSWORD="$DB_PASSWORD" psql \
    --host="localhost" \
    --port="$PROXY_PORT" \
    --username="$DB_USER" \
    --dbname="$DB_NAME" \
    --file="migrations/042_expand_planilla_operativa_fields.sql" \
    --set="ON_ERROR_STOP=1"

RESULT=$?

# Encerra proxy
kill $PROXY_PID 2>/dev/null || true
wait $PROXY_PID 2>/dev/null || true

if [ $RESULT -eq 0 ]; then
    echo "✅ Migration 042 executada com sucesso!"
else
    echo "❌ Migration 042 falhou"
    exit 1
fi

echo ""
echo "🎉 Concluído! As colunas foram adicionadas:"
echo "   - job_postings.daily_obs"
echo "   - job_postings.inferred_zone"
echo "   - publications.group_geographic_zone"
echo ""
