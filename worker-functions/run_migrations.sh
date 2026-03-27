#!/bin/bash

# Script para rodar migrations usando gcloud sql connect
# Executa SQL diretamente via conexão Cloud SQL (para ambientes cloud/claude)

set -e

echo "🚀 Rodando migrations via gcloud sql connect..."
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

# Função para rodar migration usando cloud-sql-proxy + psql
run_migration() {
    local file=$1
    echo "📝 Executando: $file"
    
    # Inicia proxy em background na porta 5435
    local PROXY_PORT="5435"
    local INSTANCE="${PROJECT}:southamerica-west1:enlite-ar-db"
    
    echo "   🔌 Iniciando Cloud SQL Proxy..."
    cloud-sql-proxy --port "$PROXY_PORT" "$INSTANCE" &
    local PROXY_PID=$!
    
    # Aguarda proxy iniciar
    sleep 4
    
    # Executa migration via psql
    echo "   📤 Enviando SQL..."
    PGPASSWORD="$DB_PASSWORD" psql \
        --host="localhost" \
        --port="$PROXY_PORT" \
        --username="$DB_USER" \
        --dbname="$DB_NAME" \
        --file="$file" \
        --set="ON_ERROR_STOP=1"
    
    local RESULT=$?
    
    # Encerra proxy
    kill $PROXY_PID 2>/dev/null || true
    wait $PROXY_PID 2>/dev/null || true
    
    if [ $RESULT -eq 0 ]; then
        echo "✅ $file - OK"
    else
        echo "❌ $file - FALHOU"
        exit 1
    fi
    echo ""
}

# Migrations (apenas 023 - as anteriores já devem estar aplicadas)
echo "⚠️  Executando apenas migration 023..."
echo "   (003-006 já devem estar aplicadas no ambiente)"
echo ""
run_migration "migrations/023_encrypt_all_pii.sql"

echo "🎉 Migration 023 executada com sucesso!"
echo ""
