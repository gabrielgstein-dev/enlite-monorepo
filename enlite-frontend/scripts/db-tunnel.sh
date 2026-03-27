#!/bin/bash

# Script para criar SSH tunnel persistente para banco de produção
# Uso: ./scripts/db-tunnel.sh

set -e

# Cores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🔐 Iniciando SSH Tunnel para banco de produção...${NC}"

# Configurações - AJUSTE CONFORME SEU AMBIENTE
SSH_USER="${SSH_USER:-seu-usuario}"
SSH_HOST="${SSH_HOST:-seu-servidor.com}"
SSH_PORT="${SSH_PORT:-22}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
LOCAL_PORT="${LOCAL_PORT:-5433}"

# Verifica se já existe um tunnel ativo
if lsof -Pi :$LOCAL_PORT -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo -e "${RED}❌ Porta $LOCAL_PORT já está em uso${NC}"
    echo -e "${YELLOW}Encerrando processo existente...${NC}"
    kill $(lsof -t -i:$LOCAL_PORT) 2>/dev/null || true
    sleep 2
fi

echo -e "${GREEN}✅ Criando tunnel SSH...${NC}"
echo -e "   SSH: ${SSH_USER}@${SSH_HOST}:${SSH_PORT}"
echo -e "   DB:  ${DB_HOST}:${DB_PORT}"
echo -e "   Local: localhost:${LOCAL_PORT}"
echo ""

# Cria o tunnel com keep-alive
ssh -N -L ${LOCAL_PORT}:${DB_HOST}:${DB_PORT} \
    -o ServerAliveInterval=60 \
    -o ServerAliveCountMax=3 \
    -o TCPKeepAlive=yes \
    -o ExitOnForwardFailure=yes \
    -p ${SSH_PORT} \
    ${SSH_USER}@${SSH_HOST}
