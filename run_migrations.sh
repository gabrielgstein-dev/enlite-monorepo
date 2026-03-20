#!/bin/bash

# Script para rodar todas as migrations do sistema multi-role
# Uso: ./run_migrations.sh

set -e

echo "🚀 Rodando migrations do sistema multi-role..."
echo ""

# Verifica se está conectado ao gcloud
if ! gcloud config get-value project &>/dev/null; then
    echo "❌ Erro: Não está autenticado no gcloud"
    echo "   Rode: gcloud auth login"
    exit 1
fi

PROJECT=$(gcloud config get-value project)
echo "📦 Projeto: $PROJECT"
echo ""

# Função para rodar migration
run_migration() {
    local file=$1
    echo "📝 Executando: $file"
    
    # Conecta e executa o arquivo SQL
    gcloud sql connect enlite-ar-db --user=postgres --database=postgres << EOF
$(cat "$file")
EOF
    
    if [ $? -eq 0 ]; then
        echo "✅ $file - OK"
    else
        echo "❌ $file - FALHOU"
        exit 1
    fi
    echo ""
}

# Migrations na ordem
run_migration "migrations/003_create_users_base_table.sql"
run_migration "migrations/004_refactor_workers_to_extension.sql"
run_migration "migrations/005_create_future_role_tables.sql"
run_migration "migrations/006_create_user_helper_functions.sql"

echo "🎉 Todas as migrations foram executadas com sucesso!"
echo ""
echo "📊 Próximos passos:"
echo "   1. Verificar tabelas criadas: \\dt"
echo "   2. Testar função: SELECT get_user_complete('test-uid');"
