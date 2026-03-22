#!/bin/bash

# Script para criar SSH tunnel em background (não trava o terminal)
# Uso: ./scripts/db-tunnel-background.sh start|stop|status

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Configurações - AJUSTE CONFORME SEU AMBIENTE
SSH_USER="${SSH_USER:-seu-usuario}"
SSH_HOST="${SSH_HOST:-seu-servidor.com}"
SSH_PORT="${SSH_PORT:-22}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
LOCAL_PORT="${LOCAL_PORT:-5433}"

PID_FILE="/tmp/db-tunnel.pid"

start_tunnel() {
    if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
        echo -e "${YELLOW}⚠️  Tunnel já está rodando (PID: $(cat $PID_FILE))${NC}"
        return 0
    fi

    echo -e "${YELLOW}🔐 Iniciando SSH Tunnel em background...${NC}"
    
    ssh -f -N -L ${LOCAL_PORT}:${DB_HOST}:${DB_PORT} \
        -o ServerAliveInterval=60 \
        -o ServerAliveCountMax=3 \
        -o TCPKeepAlive=yes \
        -o ExitOnForwardFailure=yes \
        -p ${SSH_PORT} \
        ${SSH_USER}@${SSH_HOST}
    
    # Salva o PID
    lsof -t -i:$LOCAL_PORT > "$PID_FILE"
    
    echo -e "${GREEN}✅ Tunnel ativo!${NC}"
    echo -e "   Conecte no DBeaver usando:"
    echo -e "   Host: localhost"
    echo -e "   Port: ${LOCAL_PORT}"
    echo -e "   Database: seu_database"
}

stop_tunnel() {
    if [ ! -f "$PID_FILE" ]; then
        echo -e "${RED}❌ Nenhum tunnel ativo${NC}"
        return 1
    fi

    PID=$(cat "$PID_FILE")
    if kill -0 $PID 2>/dev/null; then
        echo -e "${YELLOW}🛑 Encerrando tunnel (PID: $PID)...${NC}"
        kill $PID
        rm "$PID_FILE"
        echo -e "${GREEN}✅ Tunnel encerrado${NC}"
    else
        echo -e "${RED}❌ Processo não encontrado${NC}"
        rm "$PID_FILE"
    fi
}

status_tunnel() {
    if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
        echo -e "${GREEN}✅ Tunnel ATIVO (PID: $(cat $PID_FILE))${NC}"
        echo -e "   Porta local: ${LOCAL_PORT}"
        lsof -i :$LOCAL_PORT
    else
        echo -e "${RED}❌ Tunnel INATIVO${NC}"
        [ -f "$PID_FILE" ] && rm "$PID_FILE"
    fi
}

case "${1:-}" in
    start)
        start_tunnel
        ;;
    stop)
        stop_tunnel
        ;;
    status)
        status_tunnel
        ;;
    restart)
        stop_tunnel
        sleep 2
        start_tunnel
        ;;
    *)
        echo "Uso: $0 {start|stop|status|restart}"
        exit 1
        ;;
esac
