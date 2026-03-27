#!/bin/bash

# Cloud SQL Proxy para conectar no banco de produção
# Uso: ./scripts/db-proxy.sh [enlite-ar-db|enlite-n8n-db]

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Instâncias disponíveis
INSTANCE_AR="enlite-prd:southamerica-west1:enlite-ar-db"
INSTANCE_N8N="enlite-prd:us-central1:enlite-n8n-db"

# Seleciona instância
case "${1:-ar}" in
    ar|enlite-ar-db)
        INSTANCE=$INSTANCE_AR
        PORT=5432
        NAME="enlite-ar-db"
        ;;
    n8n|enlite-n8n-db)
        INSTANCE=$INSTANCE_N8N
        PORT=5433
        NAME="enlite-n8n-db"
        ;;
    *)
        echo -e "${RED}❌ Instância inválida${NC}"
        echo "Uso: $0 [ar|n8n]"
        exit 1
        ;;
esac

echo -e "${YELLOW}🔐 Iniciando Cloud SQL Proxy para ${NAME}...${NC}"

# Verifica se a porta já está em uso
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo -e "${RED}❌ Porta $PORT já está em uso${NC}"
    echo -e "${YELLOW}Encerrando processo existente...${NC}"
    kill $(lsof -t -i:$PORT) 2>/dev/null || true
    sleep 2
fi

echo -e "${GREEN}✅ Conectando em ${INSTANCE}${NC}"
echo -e "   Porta local: ${PORT}"
echo ""
echo -e "${YELLOW}Configure o DBeaver:${NC}"
echo -e "   Host: localhost"
echo -e "   Port: ${PORT}"
if [ "$NAME" = "enlite-ar-db" ]; then
    echo -e "   Database: enlite_ar"
    echo -e "   Username: enlite_app"
else
    echo -e "   Database: enlite_production"
fi
echo ""

# Inicia o proxy (mantém rodando)
cloud-sql-proxy $INSTANCE --port=$PORT
