#!/bin/bash
# Wrapper para iniciar o MCP de PostgreSQL conectado ao banco de produção.
# Busca a senha automaticamente do GCP Secret Manager e conecta via Cloud SQL Proxy.
#
# Pré-requisitos:
#   - gcloud autenticado no projeto enlite-prd
#   - cloud-sql-proxy rodando na porta 5435:
#     cloud-sql-proxy --port 5435 enlite-prd:southamerica-west1:enlite-ar-db

set -euo pipefail

DB_USER="enlite_app"
DB_NAME="enlite_ar"
DB_HOST="127.0.0.1"
DB_PORT="${POSTGRES_MCP_PORT:-5435}"
SECRET_NAME="enlite-ar-db-password"

# Verifica se o Cloud SQL Proxy está acessível
if ! pg_isready -h "$DB_HOST" -p "$DB_PORT" -q 2>/dev/null; then
  echo "ERRO: Cloud SQL Proxy nao esta rodando na porta $DB_PORT" >&2
  echo "Inicie com: cloud-sql-proxy --port $DB_PORT enlite-prd:southamerica-west1:enlite-ar-db" >&2
  exit 1
fi

# Busca senha do Secret Manager
DB_PASSWORD=$(gcloud secrets versions access latest --secret="$SECRET_NAME" 2>/dev/null)
if [ -z "$DB_PASSWORD" ]; then
  echo "ERRO: nao foi possivel obter a senha do Secret Manager ($SECRET_NAME)" >&2
  exit 1
fi

DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

exec npx -y @modelcontextprotocol/server-postgres --allow-write "$DATABASE_URL"
