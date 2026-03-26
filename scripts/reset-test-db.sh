#!/bin/bash
# Reset the E2E test database from scratch.
# Derruba o volume do postgres para que as migrations sejam reaplicadas.
# NÃO usar em produção.
set -e

COMPOSE_FILES="-f docker-compose.yml -f docker-compose.test.yml"

echo "🗑️  Derrubando containers e volumes..."
docker compose $COMPOSE_FILES down -v

echo "🚀 Subindo postgres..."
docker compose $COMPOSE_FILES up -d postgres

echo "⏳ Aguardando postgres ficar saudável..."
for i in $(seq 1 30); do
  if docker compose $COMPOSE_FILES exec postgres pg_isready -U enlite_admin -d enlite_e2e > /dev/null 2>&1; then
    echo "✅ Postgres pronto"
    break
  fi
  sleep 1
done

echo ""
echo "▶️  Suba a API (com migrations automáticas):"
echo "   docker compose -f docker-compose.yml -f docker-compose.test.yml up -d api"
