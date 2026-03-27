#!/bin/bash

# Cloud SQL Proxy em background
# Uso: ./scripts/db-proxy-background.sh {start|stop|status} [ar|n8n]

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Instâncias disponíveis
INSTANCE_AR="enlite-prd:southamerica-west1:enlite-ar-db"
INSTANCE_N8N="enlite-prd:us-central1:enlite-n8n-db"

# Seleciona instância (padrão: ar)
DB_NAME="${2:-ar}"
case "$DB_NAME" in
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
        echo -e "${RED}❌ Instância inválida: $DB_NAME${NC}"
        echo "Uso: $0 {start|stop|status} [ar|n8n]"
        exit 1
        ;;
esac

PID_FILE="/tmp/db-proxy-${NAME}.pid"
LOG_FILE="/tmp/db-proxy-${NAME}.log"

start_proxy() {
    if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
        echo -e "${YELLOW}⚠️  Proxy já está rodando (PID: $(cat $PID_FILE))${NC}"
        return 0
    fi

    # Verifica se a porta já está em uso
    if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1 ; then
        echo -e "${RED}❌ Porta $PORT já está em uso${NC}"
        kill $(lsof -t -i:$PORT) 2>/dev/null || true
        sleep 2
    fi

    echo -e "${YELLOW}🔐 Iniciando Cloud SQL Proxy em background...${NC}"
    echo -e "   Instância: ${INSTANCE}"
    echo -e "   Porta: ${PORT}"
    
    # Inicia em background e redireciona logs
    nohup cloud-sql-proxy $INSTANCE --port=$PORT > "$LOG_FILE" 2>&1 &
    
    # Salva o PID
    echo $! > "$PID_FILE"
    
    # Aguarda 2 segundos e verifica se iniciou
    sleep 2
    if kill -0 $(cat "$PID_FILE") 2>/dev/null; then
        echo -e "${GREEN}✅ Proxy ativo!${NC}"
        echo -e ""
        echo -e "${YELLOW}Configure o DBeaver:${NC}"
        echo -e "   Host: localhost"
        echo -e "   Port: ${PORT}"
        if [ "$NAME" = "enlite-ar-db" ]; then
            echo -e "   Database: enlite_ar"
            echo -e "   Username: enlite_app"
        else
            echo -e "   Database: enlite_production"
        fi
        echo -e ""
        echo -e "Logs em: ${LOG_FILE}"
    else
        echo -e "${RED}❌ Falha ao iniciar proxy${NC}"
        cat "$LOG_FILE"
        rm "$PID_FILE"
        exit 1
    fi
}

stop_proxy() {
    if [ ! -f "$PID_FILE" ]; then
        echo -e "${RED}❌ Nenhum proxy ativo para ${NAME}${NC}"
        return 1
    fi

    PID=$(cat "$PID_FILE")
    if kill -0 $PID 2>/dev/null; then
        echo -e "${YELLOW}🛑 Encerrando proxy ${NAME} (PID: $PID)...${NC}"
        kill $PID
        rm "$PID_FILE"
        echo -e "${GREEN}✅ Proxy encerrado${NC}"
    else
        echo -e "${RED}❌ Processo não encontrado${NC}"
        rm "$PID_FILE"
    fi
}

status_proxy() {
    echo -e "${YELLOW}Status dos proxies:${NC}"
    echo ""
    
    for db in ar n8n; do
        case "$db" in
            ar)
                inst=$INSTANCE_AR
                p=5432
                n="enlite-ar-db"
                ;;
            n8n)
                inst=$INSTANCE_N8N
                p=5433
                n="enlite-n8n-db"
                ;;
        esac
        
        pf="/tmp/db-proxy-${n}.pid"
        
        if [ -f "$pf" ] && kill -0 $(cat "$pf") 2>/dev/null; then
            echo -e "${GREEN}✅ ${n} ATIVO${NC} (PID: $(cat $pf), porta: $p)"
        else
            echo -e "${RED}❌ ${n} INATIVO${NC}"
            [ -f "$pf" ] && rm "$pf"
        fi
    done
}

case "${1:-}" in
    start)
        start_proxy
        ;;
    stop)
        stop_proxy
        ;;
    status)
        status_proxy
        ;;
    restart)
        stop_proxy
        sleep 2
        start_proxy
        ;;
    *)
        echo "Uso: $0 {start|stop|status|restart} [ar|n8n]"
        echo ""
        echo "Exemplos:"
        echo "  $0 start ar      # Inicia proxy para enlite-ar-db na porta 5432"
        echo "  $0 start n8n     # Inicia proxy para enlite-n8n-db na porta 5433"
        echo "  $0 status        # Mostra status de todos os proxies"
        echo "  $0 stop ar       # Para o proxy do enlite-ar-db"
        exit 1
        ;;
esac
