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

# Função para rodar migration usando gcloud sql connect
run_migration() {
    local file=$1
    echo "📝 Executando: $file"
    
    # Cria arquivo temporário com comando SQL + senha
    local TMP_SQL=$(mktemp)
    cat "$file" > "$TMP_SQL"
    
    # Executa via gcloud sql connect com here-document
    # A senha é passada quando solicitada pelo prompt
    (
        sleep 2
        echo "$DB_PASSWORD"
        sleep 1
    ) | gcloud sql connect "$INSTANCE" \
        --user="$DB_USER" \
        --database="$DB_NAME" \
        --quiet < "$TMP_SQL" 2>&1 | grep -v "^Password:" || true
    
    local EXIT_CODE=$?
    rm -f "$TMP_SQL"
    
    if [ $EXIT_CODE -eq 0 ]; then
        echo "✅ $file - OK"
    else
        echo "❌ $file - FALHOU (código: $EXIT_CODE)"
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
