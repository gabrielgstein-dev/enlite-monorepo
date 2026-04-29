#!/bin/bash
# Garante que o Cloud SQL Proxy está rodando na porta 5435.
# Se não estiver, inicia em background e aguarda ficar pronto.
# Usado pelo `make snap` antes de gerar o snapshot de prod.

set -euo pipefail

DB_PORT=5435
INSTANCE="enlite-prd:southamerica-west1:enlite-ar-db"
PID_FILE="/tmp/enlite-cloud-sql-proxy.pid"

# Já está rodando?
if pg_isready -h 127.0.0.1 -p "$DB_PORT" -q 2>/dev/null; then
  echo "✅  Cloud SQL Proxy já está na porta $DB_PORT."
  exit 0
fi

# cloud-sql-proxy disponível?
if ! command -v cloud-sql-proxy &>/dev/null; then
  echo "❌  cloud-sql-proxy não encontrado no PATH."
  echo "    Instale em: https://cloud.google.com/sql/docs/postgres/sql-proxy#install"
  exit 1
fi

# gcloud autenticado?
if ! gcloud auth print-access-token &>/dev/null 2>&1; then
  echo "❌  gcloud não está autenticado. Execute: gcloud auth login"
  exit 1
fi

echo "🔌  Iniciando Cloud SQL Proxy (porta $DB_PORT)..."
cloud-sql-proxy --port "$DB_PORT" "$INSTANCE" > /tmp/enlite-cloud-sql-proxy.log 2>&1 &
PROXY_PID=$!
echo "$PROXY_PID" > "$PID_FILE"

# Aguarda até 20 segundos
for i in $(seq 1 20); do
  if pg_isready -h 127.0.0.1 -p "$DB_PORT" -q 2>/dev/null; then
    echo "✅  Proxy pronto (PID $PROXY_PID)."
    exit 0
  fi
  sleep 1
done

echo "❌  Proxy não ficou pronto em 20 segundos."
echo "    Log: /tmp/enlite-cloud-sql-proxy.log"
kill "$PROXY_PID" 2>/dev/null || true
exit 1
