#!/bin/bash
# Wrapper para iniciar o MCP de PostgreSQL conectado ao banco de produção.
# Busca a senha automaticamente do GCP Secret Manager e conecta via Cloud SQL Proxy.
# Se o Cloud SQL Proxy não estiver rodando, inicia automaticamente.
#
# Pré-requisitos:
#   - gcloud autenticado no projeto enlite-prd
#   - cloud-sql-proxy instalado (https://cloud.google.com/sql/docs/postgres/sql-proxy)
#   - pg_isready disponível (pacote postgresql-client)
#   - Acesso ao secret "enlite-ar-db-password" no Secret Manager

set -euo pipefail

DB_USER="enlite_app"
DB_NAME="enlite_ar"
DB_HOST="127.0.0.1"
DB_PORT="${POSTGRES_MCP_PORT:-5435}"
SECRET_NAME="enlite-ar-db-password"
INSTANCE="enlite-prd:southamerica-west1:enlite-ar-db"
PROXY_PID=""

# Verifica se o Cloud SQL Proxy está acessível; se não, inicia automaticamente
if ! pg_isready -h "$DB_HOST" -p "$DB_PORT" -q 2>/dev/null; then
  echo "Cloud SQL Proxy nao esta rodando na porta $DB_PORT. Iniciando..." >&2

  if ! command -v cloud-sql-proxy &>/dev/null; then
    echo "ERRO: cloud-sql-proxy nao encontrado no PATH." >&2
    echo "Instale em: https://cloud.google.com/sql/docs/postgres/sql-proxy#install" >&2
    exit 1
  fi

  cloud-sql-proxy --port "$DB_PORT" "$INSTANCE" &
  PROXY_PID=$!

  # Aguarda o proxy ficar pronto (até 15 segundos)
  RETRIES=15
  until pg_isready -h "$DB_HOST" -p "$DB_PORT" -q 2>/dev/null; do
    RETRIES=$((RETRIES - 1))
    if [ "$RETRIES" -eq 0 ]; then
      echo "ERRO: Cloud SQL Proxy nao ficou pronto apos 15 segundos." >&2
      kill "$PROXY_PID" 2>/dev/null
      exit 1
    fi
    sleep 1
  done

  echo "Cloud SQL Proxy pronto na porta $DB_PORT." >&2
fi

# Busca senha do Secret Manager
DB_PASSWORD=$(gcloud secrets versions access latest --secret="$SECRET_NAME" 2>/dev/null)
if [ -z "$DB_PASSWORD" ]; then
  echo "ERRO: nao foi possivel obter a senha do Secret Manager ($SECRET_NAME)" >&2
  exit 1
fi

DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

if [ -n "$PROXY_PID" ]; then
  # Proxy foi iniciado por este script: encerra junto quando o MCP sair
  trap 'kill "$PROXY_PID" 2>/dev/null; wait "$PROXY_PID" 2>/dev/null' EXIT
  npx -y @modelcontextprotocol/server-postgres --allow-write "$DATABASE_URL"
else
  # Proxy já estava rodando: usa exec para não deixar processo shell extra
  exec npx -y @modelcontextprotocol/server-postgres --allow-write "$DATABASE_URL"
fi
